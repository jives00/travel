import path from "node:path";
import { config } from "dotenv";
config({ path: path.join(__dirname, "../../../.env") });

import { runMigrations } from "../src/test/runMigrations";

async function main() {
  await runMigrations(process.env.DB_NAME ?? "travel", {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
