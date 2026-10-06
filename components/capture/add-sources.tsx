"use client";
import { useRef, useState } from "react";
import { optimizeProductPhotos } from "@/lib/client/product-photo-upload";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { post } from "@/lib/client/api";
import type { Upload } from "@/lib/client/capture-draft";
export function AddSources({
  productId,
  truthId,
  remaining,
  disabled,
  onAdded,
}: {
  productId: string;
  truthId: string | null;
  remaining: number;
  disabled: boolean;
  onAdded: () => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add(selected: FileList | null) {
    if (!selected?.length) return;
    setBusy(true);
    setError("");
    try {
      const photos = Array.from(selected);
      if (photos.length > remaining)
        throw new Error(`You can add ${remaining} more source photo(s).`);
      const previews = await optimizeProductPhotos(photos);
      const files: File[] = [];
      const metadata: Array<{
        kind: "original" | "derivative";
        mime: string;
        size: number;
        parentIndex: number | null;
      }> = [];
      photos.forEach((photo, n) => {
        const parent = files.length;
        files.push(photo);
        metadata.push({
          kind: "original",
          mime: photo.type,
          size: photo.size,
          parentIndex: null,
        });
        if (previews[n] !== photo) {
          files.push(previews[n]);
          metadata.push({
            kind: "derivative",
            mime: previews[n].type,
            size: previews[n].size,
            parentIndex: parent,
          });
        }
      });
      const key = crypto.randomUUID();
      const { uploads } = await post<{ uploads: Upload[] }>("/api/uploads", {
        key,
        files: metadata,
      });
      const client = createBrowserSupabaseClient();
      for (const [n, upload] of uploads.entries()) {
        const { error } = await client.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token!, files[n], {
            contentType: upload.mime,
          });
        if (error) throw error;
      }
      await post(`/api/products/${productId}/sources`, {
        key,
        truthId,
        files: uploads,
      });
      await onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add sources.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="add-sources">
      <button
        type="button"
        className="secondary"
        disabled={disabled || busy || remaining === 0}
        onClick={() => input.current?.click()}
      >
        {busy ? "Saving detail photos…" : "＋ Add detail photos"}
      </button>
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        ref={input}
        onChange={(e) => {
          void add(e.target.files);
        }}
      />
      <small>
        New evidence creates a new truth draft and requires new confirmation and
        verification. {remaining} source slots available.
      </small>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
