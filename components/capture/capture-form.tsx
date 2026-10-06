"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { optimizeProductPhotos } from "@/lib/client/product-photo-upload";
import {
  draftStore,
  type RecordingSource,
  type Upload,
} from "@/lib/client/capture-draft";
import { post } from "@/lib/client/api";
import { VoiceInput } from "./voice-input";
import { PhotoPreview } from "./photo-preview";
export function CaptureForm({ owner }: { owner: string }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("mixed");
  const [key, setKey] = useState("");
  const [recording, setRecording] = useState<RecordingSource | null>(null);
  const [restored, setRestored] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [progress, setProgress] = useState("");
  useEffect(() => {
    let alive = true;
    void draftStore(owner)
      .then((d) => {
        if (!alive) return;
        if (d) {
          setPhotos(d.photos);
          setText(d.text);
          setLanguage(d.language);
          setKey(d.key);
          setRecording(d.recording);
          setRestored(true);
        } else setKey(crypto.randomUUID());
        setReady(true);
      })
      .catch(() => {
        if (alive) {
          setKey(crypto.randomUUID());
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [owner]);
  useEffect(() => {
    if (!ready || busy) return;
    const timer = setTimeout(() => {
      void draftStore(owner, { photos, text, language, key, recording }).catch(
        () => {},
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [owner, photos, text, language, key, recording, ready, busy]);
  function add(files: FileList | null) {
    if (!files) return;
    setError("");
    const next = [...photos, ...Array.from(files)];
    if (next.length > 6) {
      setError("Use up to six product photos.");
      return;
    }
    if (next.some((f) => f.size > 15 * 1024 * 1024)) {
      setError("Choose photos smaller than 15 MB.");
      return;
    }
    setPhotos(next);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setProgress("Preparing photo previews…");
      const derivatives = await optimizeProductPhotos(photos);
      const files: File[] = [];
      const metadata: Array<{
        kind: "original" | "derivative";
        mime: string;
        size: number;
        parentIndex: number | null;
      }> = [];
      photos.forEach((photo, n) => {
        const originalIndex = files.length;
        files.push(photo);
        metadata.push({
          kind: "original",
          mime: photo.type || "image/jpeg",
          size: photo.size,
          parentIndex: null,
        });
        const derivative = derivatives[n];
        if (derivative !== photo) {
          files.push(derivative);
          metadata.push({
            kind: "derivative",
            mime: derivative.type,
            size: derivative.size,
            parentIndex: originalIndex,
          });
        }
      });
      const { uploads } = await post<{ uploads: Upload[] }>("/api/uploads", {
        key,
        files: metadata,
      });
      const client = createBrowserSupabaseClient();
      for (const [n, upload] of uploads.entries()) {
        setProgress(`Uploading source ${n + 1} of ${uploads.length}…`);
        const { error } = await client.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token!, files[n], {
            contentType: upload.mime,
          });
        if (error) throw error;
      }
      setProgress("Saving originals and starting Product Truth…");
      const result = await post<{ productId: string }>("/api/products", {
        key,
        files: [...uploads, ...(recording ? [recording.upload] : [])],
        description: {
          text,
          raw_transcript: recording?.rawTranscript ?? null,
          language,
          model: recording?.model ?? null,
        },
      });
      await draftStore(owner, null).catch(() => {});
      router.push(`/products/${result.productId}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Upload failed. Your draft is retained.",
      );
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">01 / SOURCE & CLAIMS</p>
          <h1>Show it. Tell its story.</h1>
          <p>Real photos and your own words are the starting point.</p>
        </div>
      </header>
      {restored && (
        <div className="notice">
          Your saved capture has been restored.{" "}
          <button
            className="link-button"
            disabled={busy}
            onClick={() => {
              setPhotos([]);
              setText("");
              setRecording(null);
              setKey(crypto.randomUUID());
              setRestored(false);
            }}
          >
            Start fresh
          </button>
        </div>
      )}
      <form className="capture-grid" onSubmit={submit}>
        <section className="panel">
          <div className="section-heading">
            <h2>Product photos</h2>
            <span className="badge">{photos.length}/6</span>
          </div>
          <p>
            Include the whole product and close-ups of defining details. For a
            saree, include its border, pallu, motifs, and blouse piece if
            supplied.
          </p>
          <div className="upload-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              ◉ Take photo
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => library.current?.click()}
            >
              ＋ Photo library
            </button>
          </div>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={library}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="capture-photos">
            {photos.map((photo, n) => (
              <article key={`${photo.name}-${n}`}>
                <PhotoPreview file={photo} />
                <div>
                  <span>Source {n + 1}</span>
                  <div>
                    <button
                      aria-label={`Move photo ${n + 1} earlier`}
                      type="button"
                      className="link-button"
                      disabled={busy || n === 0}
                      onClick={() =>
                        setPhotos((current) => {
                          const list = [...current];
                          [list[n - 1], list[n]] = [list[n], list[n - 1]];
                          return list;
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Remove photo ${n + 1}`}
                      type="button"
                      className="link-button"
                      disabled={busy}
                      onClick={() =>
                        setPhotos((current) =>
                          current.filter((_, i) => i !== n),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!photos.length && (
            <div className="upload-empty">
              ◈<p>Your product belongs here.</p>
              <small>
                Original files are preserved. Previews are stored separately.
              </small>
            </div>
          )}
        </section>
        <section className="panel">
          <p className="eyebrow">YOUR WORDS, PRESERVED</p>
          <h2>Describe the product</h2>
          <p>
            Tell us its colors, pattern, material, included pieces, and anything
            a buyer should know. Claims you make will remain clearly attributed
            to you.
          </p>
          <label>
            Speech language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={busy}
            >
              <option value="mixed">Telugu + English / తెలుగు + English</option>
              <option value="te">Telugu / తెలుగు</option>
              <option value="en">English</option>
              <option value="auto">Auto detect</option>
            </select>
          </label>
          {key && (
            <VoiceInput
              sessionKey={key}
              language={language}
              disabled={busy || !!recording}
              onActivity={setVoiceBusy}
              onTranscript={(source) => {
                setRecording(source);
                setText((current) =>
                  [current, source.rawTranscript].filter(Boolean).join("\n"),
                );
              }}
            />
          )}
          <label>
            Editable description
            <textarea
              rows={8}
              required
              value={text}
              maxLength={10000}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              placeholder="ఇది నీలం రంగు చీర… This is a blue saree with a gold border…"
            />
          </label>
          {recording && (
            <details>
              <summary>Original transcript retained</summary>
              <p>{recording.rawTranscript}</p>
            </details>
          )}
          <p className="muted">
            You’ll review Product Truth before any image is generated.
          </p>
          <button
            className="full"
            disabled={
              !ready || busy || voiceBusy || !photos.length || !text.trim()
            }
          >
            {busy ? progress : "Create Product Truth →"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </form>
    </>
  );
}
