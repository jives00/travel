/** Shrinks a picked image before it is uploaded.
 *
 * Album cards render at 336x189, but the file coming out of a phone or camera
 * is routinely 3–12MB — so the original upload was spending seconds pushing
 * pixels that were about to be thrown away, over a Tailscale hop. Downscaling
 * in the browser typically turns a 6MB photo into ~150KB, which is the whole
 * difference between "save" feeling instant and feeling broken.
 *
 * Deliberately best-effort: any failure returns the original file rather than
 * blocking the save. A slow upload beats a lost one.
 */

/** Long edge, in CSS pixels. Generous enough for a retina card (336 * 3 ≈ 1008)
 * and for the larger preview in the editor, without keeping camera resolution. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;

/** Below this there is nothing worth winning, and re-encoding a small PNG can
 * make it bigger. */
const SKIP_BELOW_BYTES = 300 * 1024;

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap decodes off the main thread where it exists, which keeps
  // the dialog responsive on a large file.
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("could not decode image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const source = await loadBitmap(file);
    const width = "width" in source ? source.width : 0;
    const height = "height" in source ? source.height : 0;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    // Already small enough — re-encoding would only lose quality.
    if (scale === 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // JPEG has no alpha, so a transparent PNG would composite onto black.
    // Painting white first keeps a screenshot or logo looking like itself.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    if ("close" in source) source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
