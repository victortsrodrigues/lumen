import { spawnSync } from "node:child_process";
import pg from "pg";
import { isolatedDatabaseUrl } from "./isolated-database";

// Production migrations are incremental over the original schema. Only this
// isolated test provisioner may create a baseline using drizzle-kit push.
const connection = isolatedDatabaseUrl(process.env.ACCOUNTS_TEST_DATABASE_URL);
function run(args: string[]) {
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: connection },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
async function main() {
  const pool = new pg.Pool({ connectionString: connection });
  let empty: boolean;
  try {
    const result = await pool.query(
      "SELECT count(*)::int AS total FROM pg_tables WHERE schemaname='public'",
    );
    empty = result.rows[0].total === 0;
  } finally {
    await pool.end();
  }
  if (empty) run(["--filter", "@workspace/db", "exec", "drizzle-kit", "push"]);
  run(["db:migrate"]);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
