import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(currentDir, "../lib/db/migrations");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  // Prevent overlapping deployments from applying the same migration.
  await client.query("SELECT pg_advisory_lock(7102026)");
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter(file => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await client.query(
      "SELECT 1 FROM app_migrations WHERE name = $1",
      [file],
    );
    if (existing.rowCount) continue;

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO app_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(7102026)");
  } finally {
    client.release();
    await pool.end();
  }
}
