import {
  db,
  checked,
  workflow,
  sourceImages,
  bytes,
  sha256,
} from "@/lib/products/repository";
import type { Job } from "@/lib/products/repository";
import { extractTruth } from "@/lib/truth/extract";
import { generate } from "@/lib/generation/generate";
import { verify } from "@/lib/verification/verify";
export async function runNextJob() {
  const claimed = checked(await db().rpc("gandiva_claim_job")) as Job[];
  const job = claimed?.[0];
  if (!job) return false;
  let uploadedPath: string | undefined;
  try {
    const state = await workflow(job.owner_id, job.product_id, false);
    if (job.kind === "analyze") {
      const description = state.descriptions.find(
        (d) => d.id === job.payload.descriptionId,
      );
      if (!description) throw new Error("Source description is missing.");
      const images = await sourceImages(state);
      const result = await extractTruth(description.text, images);
      checked(
        await db().rpc("gandiva_finish_job", {
          p_job: job.id,
          p_lease: job.lease_token,
          p_result: { ...result, sourceIds: images.map((i) => i.id) },
        }),
      );
    } else {
      const truth = state.truths.find((t) => t.id === job.payload.truthId);
      if (!truth?.confirmed_at)
        throw new Error("Confirmed truth version is missing.");
      const images = await sourceImages(state, truth);
      const generation = state.generations.find(
        (g) => g.id === job.payload.generationId,
      );
      if (!generation) throw new Error("Generation record is missing.");
      if (job.kind === "generate") {
        const result = await generate(
          truth.record,
          images,
          generation.direction,
          generation.correction?.text,
        );
        const id = crypto.randomUUID();
        uploadedPath = `${job.owner_id}/${job.product_id}/generated/${id}.png`;
        checked(
          await db()
            .storage.from("generated-assets")
            .upload(uploadedPath, result.bytes, {
              contentType: "image/png",
              upsert: false,
            }),
        );
        checked(
          await db().rpc("gandiva_finish_job", {
            p_job: job.id,
            p_lease: job.lease_token,
            p_result: result.metadata,
            p_asset: {
              id,
              path: uploadedPath,
              mime: "image/png",
              size_bytes: result.bytes.length,
              sha256: await sha256(result.bytes),
            },
          }),
        );
      } else {
        const output = state.assets.find(
          (a) => a.id === generation.output_asset_id,
        );
        if (!output) throw new Error("Generated asset is missing.");
        const result = await verify(truth.record, images, {
          id: output.id,
          bytes: await bytes(output),
          mime: output.mime,
        });
        checked(
          await db().rpc("gandiva_finish_job", {
            p_job: job.id,
            p_lease: job.lease_token,
            p_result: result,
          }),
        );
      }
    }
  } catch (error) {
    // Preserve unknown outcomes; never erase an output that may have committed.
    const message = error instanceof Error ? error.message : "Job failed";
    checked(
      await db().rpc("gandiva_fail_job", {
        p_job: job.id,
        p_lease: job.lease_token,
        p_error: message,
      }),
    );
    if (uploadedPath)
      console.error(
        "Generation execution failed; possible unregistered output retained for recovery",
        job.id,
      );
    console.error("Gandiva job failed", job.id, message);
  }
  return true;
}
export async function drainJobs(limit = 3) {
  for (let n = 0; n < limit; n++) if (!(await runNextJob())) break;
}
