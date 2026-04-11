import pg from "pg";
const { Pool } = pg;

async function main() {
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
    console.log(`Truncated ${rows.length} tables`);
  } else {
    console.log("No tables found");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
