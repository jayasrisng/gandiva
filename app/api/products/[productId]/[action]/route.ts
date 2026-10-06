import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, HttpError } from "@/lib/auth";
import { apiError, intakeKey, uuid } from "@/lib/http";
import { workflow, db, checked, sha256 } from "@/lib/products/repository";
import { merchantRevision, truthSchema } from "@/lib/truth/schemas";
import { approvalIssues } from "@/lib/verification/policy";
import { assemble } from "@/lib/passport/assemble";
import {
  fileSchema,
  validateFile,
  stagedPath,
  extensions,
  uploadedFileSchema,
} from "@/lib/products/uploads";
import { registerAssets } from "@/lib/products/register-assets";
import { drainJobs } from "@/lib/jobs/runner";
const revision = z.object({
  truthId: uuid,
  edits: z.record(z.string(), z.string().max(2000)),
  note: z.string().max(4000).default(""),
});
const enqueue = z.object({
  key: intakeKey,
  truthId: uuid,
  direction: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .default(
      "Clean neutral studio background and soft balanced lighting. Keep the original product view.",
    ),
  parentId: uuid.optional(),
  correction: z
    .object({
      text: z.string().trim().min(1).max(4000),
      rawTranscript: z.string().max(4000).nullable().optional(),
      audioAssetId: uuid.nullable().optional(),
    })
    .optional(),
  generationId: uuid.optional(),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ productId: string; action: string }> },
) {
  try {
    const owner = await requireOwner();
    const { productId, action } = await context.params;
    uuid.parse(productId);
    const state = await workflow(owner, productId, false);
    const body = await request.json();
    const truth = state.truths.find(
      (t) => t.id === state.product.current_truth_id,
    );
    if (action === "sources") {
      const input = z
        .object({
          key: intakeKey,
          truthId: uuid.nullable(),
          files: z.array(uploadedFileSchema).min(1).max(12),
        })
        .parse(body);
      const existing = state.jobs.find((j) => j.idempotency_key === input.key);
      if (existing)
        return NextResponse.json({ jobId: existing.id }, { status: 202 });
      const count = input.files.filter((f) => f.kind === "original").length;
      if (
        !count ||
        input.files.some((f) => f.kind === "audio") ||
        state.assets.filter((a) => a.kind === "original").length + count > 6
      )
        throw new HttpError(
          400,
          "Keep up to six original source photos in V1.",
        );
      if (state.jobs.some((j) => ["queued", "running"].includes(j.status)))
        throw new HttpError(409, "Wait for the current job to finish.");
      const assets = await registerAssets(
        owner,
        input.key,
        productId,
        input.files,
      );
      const descriptionId = truth?.description_id || state.descriptions[0]?.id;
      const id = checked(
        await db().rpc("gandiva_add_sources", {
          p_owner: owner,
          p_product: productId,
          p_base: input.truthId,
          p_key: input.key,
          p_assets: assets,
          p_description: descriptionId,
        }),
      );
      after(() => drainJobs(3));
      return NextResponse.json({ jobId: id }, { status: 202 });
    }
    if (action === "recording") {
      const input = z
        .object({
          key: intakeKey,
          file: fileSchema.extend({ id: uuid, path: z.string() }),
          text: z.string().max(10000),
        })
        .parse(body);
      const file = input.file;
      validateFile(file);
      stagedPath(owner, input.key, file.path);
      if (
        file.kind !== "audio" ||
        file.parentIndex !== null ||
        file.path.split("/").pop() !== `${file.id}.${extensions[file.mime]}`
      )
        throw new HttpError(400, "Invalid correction recording.");
      const existing = checked(
        await db()
          .from("product_assets")
          .select("id")
          .eq("id", file.id)
          .eq("product_id", productId)
          .eq("owner_id", owner)
          .maybeSingle(),
      );
      if (existing) return NextResponse.json({ assetId: existing.id });
      const transcript = checked(
        await db()
          .from("source_transcripts")
          .select("*")
          .eq("owner_id", owner)
          .eq("audio_path", file.path)
          .maybeSingle(),
      );
      if (!transcript) throw new HttpError(400, "Finish transcription first.");
      const blob = checked(
        await db().storage.from("audio").download(file.path),
      );
      if (blob.size !== file.size)
        throw new HttpError(400, "Recording size changed.");
      const path = `${owner}/${productId}/${file.id}.${extensions[file.mime]}`;
      checked(await db().storage.from("audio").move(file.path, path));
      checked(
        await db()
          .from("product_assets")
          .insert({
            id: file.id,
            product_id: productId,
            owner_id: owner,
            kind: "audio",
            bucket: "audio",
            path,
            mime: file.mime,
            size_bytes: blob.size,
            sha256: await sha256(new Uint8Array(await blob.arrayBuffer())),
          }),
      );
      checked(
        await db().from("product_descriptions").insert({
          product_id: productId,
          owner_id: owner,
          text: input.text,
          raw_transcript: transcript.text,
          language: transcript.language,
          model: transcript.model,
          audio_asset_id: file.id,
        }),
      );
      return NextResponse.json({ assetId: file.id });
    }
    if (action === "truth") {
      const input = revision.parse(body);
      if (!truth || truth.id !== input.truthId)
        throw new HttpError(
          409,
          "Product Truth changed. Reload before editing.",
        );
      if (
        Object.keys(input.edits).some(
          (id) => !truth.record.facts.some((f) => f.id === id),
        )
      )
        throw new HttpError(400, "Unknown attribute edit.");
      const record = merchantRevision(
        truthSchema.parse(truth.record),
        input.edits,
      );
      const description = state.descriptions.find(
        (d) => d.id === truth.description_id,
      );
      const editText = Object.entries(input.edits)
        .filter(
          ([id, value]) =>
            value !==
            (truth.record.facts.find((f) => f.id === id)?.value ?? ""),
        )
        .map(([id, value]) => `${id}: ${value || "Unknown"}`)
        .join("\n");
      const id = checked(
        await db().rpc("gandiva_save_truth", {
          p_owner: owner,
          p_product: productId,
          p_base: truth.id,
          p_record: record,
          p_description_text: editText
            ? `${description?.text ?? ""}\nMerchant revision:\n${input.note}\n${editText}`
            : null,
        }),
      );
      return NextResponse.json({ truthId: id });
    }
    if (action === "confirm") {
      const input = z
        .object({ truthId: uuid, confirmed: z.literal(true) })
        .parse(body);
      if (!truth || truth.id !== input.truthId)
        throw new HttpError(409, "Stale truth version.");
      truthSchema.parse(truth.record);
      return NextResponse.json({
        approvalId: checked(
          await db().rpc("gandiva_confirm_truth", {
            p_owner: owner,
            p_product: productId,
            p_truth: truth.id,
          }),
        ),
      });
    }
    if (["generate", "correct", "verify"].includes(action)) {
      const input = enqueue.parse(body);
      if (!truth?.confirmed_at || truth.id !== input.truthId)
        throw new HttpError(409, "Confirm the current Product Truth first.");
      if (action === "correct" && (!input.parentId || !input.correction))
        throw new HttpError(400, "Select an image and explain the correction.");
      if (
        input.correction?.audioAssetId &&
        !state.assets.some(
          (a) => a.id === input.correction?.audioAssetId && a.kind === "audio",
        )
      )
        throw new HttpError(400, "Unknown correction audio.");
      if (action === "verify" && !input.generationId)
        throw new HttpError(400, "Select an image to verify.");
      const id = checked(
        await db().rpc("gandiva_enqueue", {
          p_owner: owner,
          p_product: productId,
          p_kind: action === "verify" ? "verify" : "generate",
          p_key: input.key,
          p_payload: input,
        }),
      );
      after(() => drainJobs(3));
      return NextResponse.json({ jobId: id }, { status: 202 });
    }
    if (action === "analyze") {
      const input = z
        .object({ key: intakeKey, descriptionId: uuid })
        .parse(body);
      if (!state.descriptions.some((d) => d.id === input.descriptionId))
        throw new HttpError(400, "Unknown source description.");
      const id = checked(
        await db().rpc("gandiva_enqueue", {
          p_owner: owner,
          p_product: productId,
          p_kind: "analyze",
          p_key: input.key,
          p_payload: input,
        }),
      );
      after(() => drainJobs(3));
      return NextResponse.json({ jobId: id }, { status: 202 });
    }
    if (action === "approve") {
      const input = z
        .object({
          truthId: uuid,
          generationId: uuid,
          verificationId: uuid,
          confirmed: z.literal(true),
          warnings: z.array(z.string()),
        })
        .parse(body);
      const generation = state.generations.find(
        (g) => g.id === input.generationId,
      );
      const verification = state.verifications.find(
        (v) => v.id === input.verificationId,
      );
      if (
        !truth?.confirmed_at ||
        truth.id !== input.truthId ||
        !generation ||
        generation.truth_version_id !== truth.id ||
        generation.status !== "completed" ||
        !verification?.report ||
        verification.status !== "completed" ||
        verification.generation_id !== generation.id ||
        verification.truth_version_id !== truth.id
      )
        throw new HttpError(
          409,
          "Completed verification of this image against current truth is required.",
        );
      const issues = approvalIssues(truth.record, verification.report);
      if (issues.length) throw new HttpError(409, issues.join(" "));
      const { snapshot, hash } = await assemble(
        state,
        truth,
        generation,
        verification,
      );
      const id = checked(
        await db().rpc("gandiva_approve", {
          p_owner: owner,
          p_product: productId,
          p_truth: truth.id,
          p_generation: generation.id,
          p_verification: verification.id,
          p_warnings: input.warnings,
          p_snapshot: snapshot,
          p_hash: hash,
        }),
      );
      return NextResponse.json({ passportId: id });
    }
    throw new HttpError(404, "Unknown action.");
  } catch (error) {
    return apiError(error);
  }
}
