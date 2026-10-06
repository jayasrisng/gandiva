import type { z } from "zod";
import {
  uploadedFileSchema,
  validateFile,
  stagedPath,
  checkImageMagic,
  extensions,
} from "./uploads";
import { db, checked, sha256 } from "./repository";
import { HttpError } from "@/lib/auth";
export async function registerAssets(
  owner: string,
  key: string,
  productId: string,
  files: z.infer<typeof uploadedFileSchema>[],
) {
  if (new Set(files.map((f) => f.id)).size !== files.length)
    throw new HttpError(400, "Duplicate asset IDs.");
  const assets = [];
  for (const [index, file] of files.entries()) {
    validateFile(file);
    stagedPath(owner, key, file.path);
    if (file.path.split("/").pop() !== `${file.id}.${extensions[file.mime]}`)
      throw new HttpError(400, "Invalid source filename.");
    if (
      file.kind === "derivative" &&
      (file.parentIndex === null ||
        file.parentIndex >= index ||
        files[file.parentIndex]?.kind !== "original")
    )
      throw new HttpError(400, "Derivative has no original source.");
    if (file.kind !== "derivative" && file.parentIndex !== null)
      throw new HttpError(400, "Invalid source parent.");
    const bucket = file.kind === "audio" ? "audio" : "product-images";
    const blob = checked(await db().storage.from(bucket).download(file.path));
    if (blob.size !== file.size)
      throw new HttpError(400, "Source upload size changed.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    checkImageMagic(bytes, file.mime);
    const path = `${owner}/${productId}/${file.id}.${extensions[file.mime]}`;
    checked(await db().storage.from(bucket).move(file.path, path));
    assets.push({
      id: file.id,
      kind: file.kind,
      bucket,
      path,
      mime: file.mime,
      size_bytes: blob.size,
      sha256: await sha256(bytes),
      parent_asset_id:
        file.parentIndex === null ? null : files[file.parentIndex].id,
    });
  }
  return assets;
}
