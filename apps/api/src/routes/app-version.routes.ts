import type { FastifyInstance } from "fastify";

/** Proxies GitHub's releases/latest so the mobile app's self-update flow
 * (packages consumed by apps/mobile/src/store/update.ts) has one place to check. */
export async function appVersionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => {
    const res = await fetch("https://api.github.com/repos/jives00/travel/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "travel-api" },
    });
    if (!res.ok) return reply.code(502).send({ error: "could not reach GitHub releases" });
    const data = (await res.json()) as { tag_name?: string; assets?: { browser_download_url: string }[] };
    return {
      tag: data.tag_name ?? null,
      apkUrl: data.assets?.find((a) => a.browser_download_url.endsWith(".apk"))?.browser_download_url ?? null,
    };
  });
}
