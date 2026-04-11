/**
 * Migration: Simplify ministry member roles to just lider/membro.
 * Run ONCE: DATABASE_URL=... npx tsx scripts/migrate-ministry-roles.ts
 */
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://church_erp:church_erp@localhost:5433/church_erp",
});

async function migrate() {
  console.log("🔄 Migrando roles de ministério...\n");

  // Map old roles to new
  await pool.query(`ALTER TABLE ministry_members ALTER COLUMN role DROP DEFAULT`);
  await pool.query(`ALTER TABLE ministry_members ALTER COLUMN role TYPE text`);
  await pool.query(`UPDATE ministry_members SET role = 'lider' WHERE role = 'vice_lider'`);
  await pool.query(`UPDATE ministry_members SET role = 'membro' WHERE role = 'voluntario'`);
  await pool.query(`DROP TYPE IF EXISTS ministry_member_role`);
  await pool.query(`CREATE TYPE ministry_member_role AS ENUM ('lider', 'membro')`);
  await pool.query(`ALTER TABLE ministry_members ALTER COLUMN role TYPE ministry_member_role USING role::ministry_member_role`);
  await pool.query(`ALTER TABLE ministry_members ALTER COLUMN role SET DEFAULT 'membro'`);

  console.log("  ✓ Roles: lider / membro (vice_lider → lider, voluntario → membro)");
  console.log("\n✅ Migração concluída.");
  await pool.end();
}

migrate().catch((err) => { console.error("Erro:", err); process.exit(1); });
