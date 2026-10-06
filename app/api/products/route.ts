import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { requireOwner, HttpError } from "@/lib/auth";
import { apiError, intakeKey } from "@/lib/http";
import { db, checked } from "@/lib/products/repository";
import { uploadedFileSchema } from "@/lib/products/uploads";
import { registerAssets } from "@/lib/products/register-assets";
import { drainJobs } from "@/lib/jobs/runner";
const schema = z.object({
  key: intakeKey,
  files: z.array(uploadedFileSchema).min(1).max(13),
  description: z.object({
    text: z.string().trim().min(1).max(10000),
    raw_transcript: z.string().max(10000).nullable(),
    language: z.string().max(40),
    model: z.string().max(100).nullable(),
  }),
});
export async function GET() {
  try {
    const owner = await requireOwner();
    return NextResponse.json({
      products: checked(
        await db()
          .from("products")
          .select("*")
          .eq("owner_id", owner)
          .order("created_at", { ascending: false }),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  const moved: Array<{ bucket: string; path: string }> = [];
  try {
    const owner = await requireOwner();
    const input = schema.parse(await request.json());
    const existing = checked(
      await db()
        .from("jobs")
        .select("product_id")
        .eq("owner_id", owner)
        .eq("idempotency_key", input.key)
        .maybeSingle(),
    );
    if (existing) return NextResponse.json({ productId: existing.product_id });
    const count = input.files.filter((f) => f.kind === "original").length;
    if (
      !count ||
      count > 6 ||
      input.files.filter((f) => f.kind === "audio").length > 1
    )
      throw new HttpError(
        400,
        "Use one to six original photos and at most one recording.",
      );
    if (new Set(input.files.map((f) => f.id)).size !== input.files.length)
      throw new HttpError(400, "Duplicate asset IDs.");
    const audioFile = input.files.find((f) => f.kind === "audio");
    const transcript = audioFile
      ? checked(
          await db()
            .from("source_transcripts")
            .select("*")
            .eq("owner_id", owner)
            .eq("audio_path", audioFile.path)
            .maybeSingle(),
        )
      : null;
    if (audioFile && !transcript)
      throw new HttpError(
        400,
        "Finish transcription before submitting the recording.",
      );
    const productId = crypto.randomUUID();
    const assets = await registerAssets(
      owner,
      input.key,
      productId,
      input.files,
    );
    moved.push(...assets.map((a) => ({ bucket: a.bucket, path: a.path })));
    const result = checked(
      await db().rpc("gandiva_intake", {
        p_owner: owner,
        p_id: productId,
        p_key: input.key,
        p_assets: assets,
        p_description: {
          ...input.description,
          raw_transcript: transcript?.text ?? null,
          model: transcript?.model ?? null,
          audio_asset_id: assets.find((a) => a.kind === "audio")?.id ?? null,
        },
      }),
    );
    // Fast start only; the scheduled worker is the durable recovery path.
    after(() => drainJobs(3));
    return NextResponse.json({ productId: result }, { status: 202 });
  } catch (error) {
    // If the transaction committed but its response was lost, retain assets.
    console.error(
      "Intake failed; retained moved files for recovery",
      moved.length,
    );
    return apiError(error);
  }
}
