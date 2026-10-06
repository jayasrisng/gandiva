import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { db, checked } from "@/lib/products/repository";
import { uploadSchema, validateFile, extensions } from "@/lib/products/uploads";
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const { key, files } = uploadSchema.parse(await request.json());
    const uploads = [];
    for (const file of files) {
      validateFile(file);
      const id = crypto.randomUUID();
      const path = `${owner}/intake/${key}/${id}.${extensions[file.mime]}`;
      const bucket = file.kind === "audio" ? "audio" : "product-images";
      const data = checked(
        await db()
          .storage.from(bucket)
          .createSignedUploadUrl(path, { upsert: false }),
      );
      uploads.push({ ...file, id, path, bucket, token: data.token });
    }
    return NextResponse.json({ uploads });
  } catch (error) {
    return apiError(error);
  }
}
