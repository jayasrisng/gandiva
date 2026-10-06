"use client";
import { useEffect, useRef, useState } from "react";
import {
  preferredRecordingMimeType,
  normalizeAudioMimeType,
} from "@/lib/audio";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { post } from "@/lib/client/api";
import type { RecordingSource, Upload } from "@/lib/client/capture-draft";
export function VoiceInput({
  sessionKey,
  language,
  onTranscript,
  disabled = false,
  onActivity,
}: {
  sessionKey: string;
  language: string;
  onTranscript: (source: RecordingSource) => void;
  disabled?: boolean;
  onActivity?: (active: boolean) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const mounted = useRef(true);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timeout.current) clearTimeout(timeout.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state === "recording") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function start() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    setError("");
    onActivity?.(true);
    try {
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording needs HTTPS and a supported browser. You can type instead.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      if (!mounted.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = preferredRecordingMimeType();
      const r = mime
        ? new MediaRecorder(stream.current, { mimeType: mime })
        : new MediaRecorder(stream.current);
      recorder.current = r;
      chunks.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      r.onstop = () => {
        if (timeout.current) clearTimeout(timeout.current);
        setRecording(false);
        stream.current?.getTracks().forEach((t) => t.stop());
        const file = new File(chunks.current, "merchant-recording", {
          type: normalizeAudioMimeType(r.mimeType),
        });
        void transcribe(file);
      };
      r.start(1000);
      setRecording(true);
      timeout.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 120_000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(e instanceof Error ? e.message : "Microphone unavailable.");
      onActivity?.(false);
    }
  }
  async function transcribe(file: File) {
    setBusy(true);
    try {
      if (!file.size) throw new Error("The recording was empty. Try again.");
      const { uploads } = await post<{ uploads: Upload[] }>("/api/uploads", {
        key: sessionKey,
        files: [
          {
            kind: "audio",
            mime: file.type,
            size: file.size,
            parentIndex: null,
          },
        ],
      });
      const upload = uploads[0];
      const { error } = await createBrowserSupabaseClient()
        .storage.from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token!, file, {
          contentType: file.type,
        });
      if (error) throw error;
      const result = await post<{ text: string; model: string }>(
        "/api/transcribe",
        { key: sessionKey, path: upload.path, mime: file.type, language },
      );
      if (mounted.current)
        onTranscript({
          upload: { ...upload, token: undefined },
          rawTranscript: result.text,
          model: result.model,
          language,
        });
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      if (mounted.current) {
        setBusy(false);
        onActivity?.(false);
      }
    }
  }
  return (
    <div className="voice-control">
      <button
        type="button"
        className={recording ? "recording" : "secondary"}
        disabled={(busy || disabled) && !recording}
        onClick={start}
      >
        {recording
          ? "■ Stop recording"
          : busy
            ? "Transcribing…"
            : "● Record your description"}
      </button>
      <small>
        {recording
          ? "Speak naturally, then stop."
          : busy
            ? "Uploading privately and transcribing."
            : "Audio is retained privately as source evidence. You can edit the transcript."}
      </small>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
