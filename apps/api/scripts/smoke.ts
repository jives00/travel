/** Boot smoke test: build the app, register every plugin and route, and hit /health.
 *
 * This exists because `typecheck` cannot see it: a Fastify plugin compiled against
 * the wrong major version is a *runtime* contract, so `@fastify/multipart@10` on
 * Fastify 4 typechecked cleanly and then threw at `app.register()` on startup —
 * and the only symptom was the web proxy reporting `fetch failed`, which points at
 * the wrong app entirely. `await app.ready()` is what runs the plugin graph, so it
 * is the whole check.
 *
 * Deliberately touches no database: nothing here calls `getPool()` (the pool is a
 * lazy singleton and never connects until a query), so this runs in CI with no
 * services and no secrets, beside `pnpm test:core`.
 */
import { buildApp } from "../src/app";

// Quiet the request logger — a boot check has nothing to say unless it fails.
process.env.LOG_LEVEL ??= "silent";

async function main() {
  const app = buildApp();
  await app.ready();

  // Routing is registered lazily alongside the plugins, so inject one DB-free
  // request to prove the table was actually built and not merely accepted.
  const res = await app.inject({ method: "GET", url: "/health" });
  if (res.statusCode !== 200) {
    throw new Error(`GET /health returned ${res.statusCode}: ${res.body}`);
  }

  await app.close();
  console.log("api smoke: ok — plugins registered, /health 200");
}

main().catch((err) => {
  console.error("api smoke: FAILED");
  console.error(err);
  process.exit(1);
});
