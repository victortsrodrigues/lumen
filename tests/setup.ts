import pg from "pg";
const { Pool } = pg;

export async function setup() {
  // Verify backend is running
  try {
    const res = await fetch("http://localhost:3000/api/healthz");
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    console.log("[setup] Backend is running");
  } catch {
    throw new Error(
      "[setup] Backend not reachable at http://localhost:3000. Start it with: pnpm dev:api"
    );
  }

  // Truncate all tables for clean state
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://church_erp:church_erp@localhost:5433/church_erp",
  });

  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  const tables = rows.map((r: { tablename: string }) => `"${r.tablename}"`).join(", ");
  if (tables) {
    await pool.query(`TRUNCATE ${tables} CASCADE`);
    console.log(`[setup] Truncated ${rows.length} tables`);
  }
  await pool.end();
}
