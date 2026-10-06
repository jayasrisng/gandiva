import { z } from "zod";
import { intakeKey } from "@/lib/http";
import { HttpError } from "@/lib/auth";
export const fileSchema = z.object({
  kind: z.enum(["original", "derivative", "audio"]),
  mime: z.string(),
  size: z.number().int().positive(),
  parentIndex: z.number().int().nonnegative().nullable(),
});
export const uploadSchema = z.object({
  key: intakeKey,
  files: z.array(fileSchema).min(1).max(13),
});
export const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "video/webm": "webm",
};
export function validateFile(file: z.infer<typeof fileSchema>) {
  const photo = file.kind !== "audio";
  if (
    !extensions[file.mime] ||
    (photo
      ? !file.mime.startsWith("image/")
      : !/^(audio\/|video\/webm)/.test(file.mime))
  )
    throw new HttpError(400, "Unsupported photo or recording format.");
  if (file.size > (photo ? 15 : 25) * 1024 * 1024)
    throw new HttpError(
      400,
      photo ? "Photos must be under 15 MB." : "Audio must be under 25 MB.",
    );
  if (
    file.kind === "derivative" &&
    !["image/jpeg", "image/png", "image/webp"].includes(file.mime)
  )
    throw new HttpError(400, "Photo previews must use JPG, PNG or WebP.");
}
export function stagedPath(owner: string, key: string, path: string) {
  const prefix = `${owner}/intake/${key}/`;
  if (
    !path.startsWith(prefix) ||
    !/^[a-f0-9-]{36}\.[a-z0-9]+$/.test(path.slice(prefix.length))
  )
    throw new HttpError(400, "Invalid source upload reference.");
}
export function checkImageMagic(bytes: Uint8Array, mime: string) {
  const ascii = (a: number, b: number) =>
    String.fromCharCode(...bytes.slice(a, b));
  const valid =
    mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216
      : mime === "image/png"
        ? bytes[0] === 137 && ascii(1, 4) === "PNG"
        : mime === "image/webp"
          ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
          : ["image/heic", "image/heif"].includes(mime)
            ? ascii(4, 8) === "ftyp"
            : true;
  if (!valid) throw new HttpError(400, "Photo data does not match its format.");
}

export const uploadedFileSchema = fileSchema.extend({
  id: z.string().uuid(),
  path: z.string(),
});
