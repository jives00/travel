import path from "node:path";
import { config } from "dotenv";
// Load the root .env before anything else imports process.env values.
config({ path: path.join(__dirname, "../../../.env") });

import { buildApp } from "./app";
import { ensureAdminUser } from "./services/auth.service";

async function main() {
  await ensureAdminUser();
  const app = buildApp();
  const port = Number(process.env.API_PORT ?? 3008);
  await app.listen({ port, host: "0.0.0.0" });

  // Background pollers land here in later slices:
  // startFlightPoller(); startFxPoller();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
