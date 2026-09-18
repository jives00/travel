import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where uploaded link thumbnails live on disk.
 *
 * A bind-mounted directory rather than a BLOB column: these are whole images,
 * the DB is shared with every other app on the NAS, and serving a file from disk
 * needs no decoding round trip.
 *
 * The default is relative to the process's working directory, which in the
 * container is `/app/apps/api` (see the Dockerfile's final WORKDIR) — so it
 * resolves to `/app/apps/api/uploads/link-images`, inside the
 * `/volume2/docker/travel/uploads` bind mount that already exists. That makes
 * uploads survive a redeploy with no extra configuration; `UPLOAD_DIR`
 * overrides it, and compose sets it explicitly so the coupling is visible. */
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "link-images");

/** Only what browsers reliably render, mapped to the extension the serving
 * route hands back as a content type. SVG is deliberately absent — it can carry
 * script, and these files are served to the browser from the app's own origin. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime]),
);

/** 10MB. A phone photo pasted in unresized is a few MB; beyond this it is a
 * mistake, and the thumbnail is rendered at ~256px anyway. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The filename *is* the capability — 16 random bytes, so the serving route can
 * skip auth and an <img>/<Image> tag can load it directly without carrying a
 * bearer token. Also the shape the serving route validates against, which is
 * what makes path traversal impossible: anything not matching is refused before
 * it ever reaches the filesystem. */
export const LINK_IMAGE_NAME = /^[0-9a-f]{32}\.(jpg|png|webp|gif|avif)$/;

export function isSupportedImageMime(mime: string): boolean {
  return mime in EXTENSION_BY_MIME;
}

export function linkImagePath(filename: string): string {
  return path.join(UPLOAD_DIR, filename);
}

/** Writes the bytes and returns the generated filename. */
export async function storeLinkImage(bytes: Buffer, mime: string): Promise<string> {
  const ext = EXTENSION_BY_MIME[mime];
  if (!ext) throw new Error(`unsupported image type: ${mime}`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return filename;
}

/** Best-effort: a thumbnail that has already been replaced in the DB must not
 * fail the request just because its old file was already gone. */
export async function deleteLinkImage(filename: string | null): Promise<void> {
  if (!filename || !LINK_IMAGE_NAME.test(filename)) return;
  await unlink(path.join(UPLOAD_DIR, filename)).catch(() => undefined);
}

/** The servable path stored in `thumbnail_url`, so clients render an uploaded
 * thumbnail exactly like any other. Relative on purpose: web reaches it through
 * the Next rewrite proxy, mobile prefixes its resolved API base. */
export function linkImageUrl(filename: string): string {
  return `/api/link-images/${filename}`;
}
