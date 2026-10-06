export const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/x-wav",
  "audio/webm",
  "video/webm",
]);

export function normalizeAudioMimeType(mimeType: string) {
  return mimeType.toLowerCase().split(";", 1)[0].trim();
}

export function preferredRecordingMimeType() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  )
    return undefined;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
    (mimeType) => MediaRecorder.isTypeSupported(mimeType),
  );
}
