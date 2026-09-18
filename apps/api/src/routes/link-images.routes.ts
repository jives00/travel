import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { LINK_IMAGE_NAME, linkImagePath, MIME_BY_EXTENSION } from "../services/linkImageStore";

/** Serves uploaded link thumbnails.
 *
 * **Deliberately unauthenticated**, which is the whole reason uploads work at
 * all: an `<img>` on the web app and an `<Image>` in React Native cannot attach
 * the bearer token the rest of the API requires, so a JWT-guarded route would
 * render a broken image everywhere. The filename is the capability instead —
 * 16 random bytes, unguessable, and issued only to someone who was already
 * authenticated when they uploaded it. The app is Tailscale-only on top of that.
 *
 * Path traversal is impossible because the name is matched against
 * `LINK_IMAGE_NAME` before it is ever joined to a path: anything that isn't
 * exactly 32 hex characters plus a known image extension is refused outright,
 * so "../" never survives to reach the filesystem.
 */
export async function linkImagesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { filename: string } }>("/:filename", async (request, reply) => {
    const { filename } = request.params;
    if (!LINK_IMAGE_NAME.test(filename)) return reply.code(404).send({ error: "not found" });

    const filePath = linkImagePath(filename);
    const stats = await stat(filePath).catch(() => null);
    if (!stats?.isFile()) return reply.code(404).send({ error: "not found" });

    const ext = filename.slice(filename.lastIndexOf(".") + 1);
    // The bytes never change — the filename is regenerated on every upload — so
    // this can be cached hard, which is what makes the thumbnail row cheap to
    // re-render and lets mobile keep it offline.
    return reply
      .header("content-type", MIME_BY_EXTENSION[ext] ?? "application/octet-stream")
      .header("content-length", String(stats.size))
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(createReadStream(filePath));
  });
}
