/**
 * One-time migration: classify existing members into pipeline stages based on existing data.
 * Run ONCE after db:push that adds the pipeline_stage column.
 *
 * Usage: DATABASE_URL=postgresql://church_erp:church_erp@localhost:5433/church_erp npx tsx scripts/migrate-pipeline.ts
 */

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://church_erp:church_erp@localhost:5433/church_erp",
});

async function migrate() {
  console.log("🔄 Migrando pipeline_stage de membros existentes...\n");

  // Members with baptismDate but no completed courses → batizado
  const batized = await pool.query(`
    UPDATE members SET pipeline_stage = 'batizado'
    WHERE baptism_date IS NOT NULL
      AND pipeline_stage = 'membro_ativo'
      AND id NOT IN (SELECT member_id FROM course_enrollments WHERE completed_at IS NOT NULL)
  `);
  console.log(`  batizado: ${batized.rowCount} membro(s)`);

  // Members without baptismDate and active → frequentador
  const freq = await pool.query(`
    UPDATE members SET pipeline_stage = 'frequentador'
    WHERE baptism_date IS NULL
      AND status = 'ativo'
      AND pipeline_stage = 'membro_ativo'
  `);
  console.log(`  frequentador: ${freq.rowCount} membro(s)`);

  // Remaining active members with baptism + courses stay as membro_ativo (default)
  const active = await pool.query(`SELECT count(*) FROM members WHERE pipeline_stage = 'membro_ativo'`);
  console.log(`  membro_ativo: ${active.rows[0].count} membro(s) (mantidos)`);

  console.log("\n✅ Migração concluída.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
