import { NextResponse } from "next/server";
import { z } from "zod";
import { toFile } from "openai";
import { requireOwner, HttpError } from "@/lib/auth";
import { apiError, intakeKey } from "@/lib/http";
import { db, checked } from "@/lib/products/repository";
import { stagedPath, extensions } from "@/lib/products/uploads";
import { getOpenAI, openAIModels } from "@/lib/openai";
const schema = z.object({
  key: intakeKey,
  path: z.string(),
  mime: z.string(),
  language: z.enum(["auto", "en", "te", "mixed"]),
});
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const input = schema.parse(await request.json());
    stagedPath(owner, input.key, input.path);
    if (!extensions[input.mime] || !/^(audio\/|video\/webm)/.test(input.mime))
      throw new HttpError(400, "Unsupported recording.");
    const existing = checked(
      await db()
        .from("source_transcripts")
        .select("text,model,language")
        .eq("owner_id", owner)
        .eq("audio_path", input.path)
        .maybeSingle(),
    );
    if (existing) return NextResponse.json(existing);
    const blob = checked(await db().storage.from("audio").download(input.path));
    if (blob.size > 25 * 1024 * 1024)
      throw new HttpError(400, "Recording is too large.");
    const result = await getOpenAI().audio.transcriptions.create({
      model: openAIModels.transcription,
      file: await toFile(
        new Uint8Array(await blob.arrayBuffer()),
        "merchant." + extensions[input.mime],
        { type: input.mime },
      ),
      response_format: "json",
      ...(["en", "te"].includes(input.language)
        ? { language: input.language }
        : {}),
      prompt:
        "Product description in Telugu, English, or mixed Telugu-English. Preserve original language and code-switching; do not translate. చీర, పట్టు, అంచు, రంగు, బ్లౌజ్. Saree, silk, border, pattern, blouse. Unknown words should not be silently replaced with material or origin claims.",
    });
    const record = {
      text: result.text,
      model: openAIModels.transcription,
      language: input.language,
    };
    checked(
      await db()
        .from("source_transcripts")
        .insert({ ...record, owner_id: owner, audio_path: input.path }),
    );
    return NextResponse.json(record);
  } catch (error) {
    return apiError(error);
  }
}
