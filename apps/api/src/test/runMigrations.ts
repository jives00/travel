import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

const IDEMPOTENT_ERROR_CODES = new Set(["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_DUP_ENTRY"]);

/** Runs every not-yet-applied migration in apps/api/migrations against `dbName`.
 * Each file executes as ONE conn.query() call — deliberately not split on ';',
 * since naive splitting breaks on semicolons inside SQL comments. */
export async function runMigrations(dbName: string, dbConfig: DbConfig): Promise<void> {
  const conn = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbName,
    multipleStatements: true,
  });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const migrationsDir = path.join(__dirname, "../../migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && f !== "test-seed.sql")
      .sort();

    for (const file of files) {
      const [rows] = await conn.query("SELECT 1 FROM migrations WHERE name = ?", [file]);
      if ((rows as unknown[]).length > 0) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      try {
        await conn.query(sql);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (!code || !IDEMPOTENT_ERROR_CODES.has(code)) throw err;
        // partially-applied migration — fall through and record it as applied
      }
      await conn.query("INSERT INTO migrations (name) VALUES (?)", [file]);
      console.log(`Applied ${file}`);
    }
  } finally {
    await conn.end();
  }
}
