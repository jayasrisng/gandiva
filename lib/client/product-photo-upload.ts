const DEFAULT_MAX_EDGE = 2_048;
const MIN_EDGE = 960;
// Photos now travel directly to Supabase Storage, so they no longer need to fit
// inside the hosted site's small request-body limit. Two megabytes retains much
// more garment detail while keeping mobile uploads quick and predictable.
const STORAGE_TARGET_BYTES = 2_000_000;
const JPEG_QUALITIES = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new Error("This browser could not prepare the photo for upload."),
          );
      },
      "image/jpeg",
      quality,
    );
  });
}

async function decodePhoto(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Safari can decode some camera formats through <img> even when createImageBitmap cannot.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error(
      `${file.name} could not be opened. Choose a JPG, PNG, WebP, or a camera photo supported by this browser.`,
    );
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

function jpegFilename(filename: string) {
  const stem =
    filename
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "product-photo";
  return `${stem}.jpg`;
}

/**
 * Prepares a phone photo for storage while retaining a 2K source for garment,
 * weave, and border analysis. Aspect ratio is never changed.
 */
export async function optimizeProductPhoto(file: File, targetBytes: number) {
  if (
    file.size <= targetBytes &&
    ["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    return file;

  const decoded = await decodePhoto(file);
  try {
    if (!decoded.width || !decoded.height)
      throw new Error(`${file.name} has invalid image dimensions.`);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context)
      throw new Error("This browser could not prepare the photo for upload.");

    let scale = Math.min(
      1,
      DEFAULT_MAX_EDGE / Math.max(decoded.width, decoded.height),
    );
    let bestBlob: Blob | undefined;

    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasBlob(canvas, quality);
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
        if (blob.size <= targetBytes) {
          return new File([blob], jpegFilename(file.name), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          });
        }
      }

      const currentLongEdge = Math.max(canvas.width, canvas.height);
      if (currentLongEdge <= MIN_EDGE) break;
      const sizeRatio = Math.sqrt(
        targetBytes / Math.max(bestBlob?.size ?? targetBytes, 1),
      );
      scale *= Math.max(0.68, Math.min(0.88, sizeRatio * 0.94));
    }

    if (!bestBlob) throw new Error(`${file.name} could not be optimized.`);
    return new File([bestBlob], jpegFilename(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    decoded.dispose();
  }
}

export async function optimizeProductPhotos(files: File[]) {
  if (!files.length) return [];
  const optimized: File[] = [];
  for (const file of files)
    optimized.push(await optimizeProductPhoto(file, STORAGE_TARGET_BYTES));
  return optimized;
}
