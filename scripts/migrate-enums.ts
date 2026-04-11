/**
 * Migration: Update member enums (status, pipeline, sex) + add enrollment_type column.
 * Run ONCE: DATABASE_URL=... npx tsx scripts/migrate-enums.ts
 */

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://church_erp:church_erp@localhost:5433/church_erp",
});

async function migrate() {
  console.log("🔄 Migrando enums de membros...\n");

  // 1. Pipeline stage: old (6 stages) → new (3 stages: culto, pequeno_grupo, ministerio)
  console.log("  [1/4] Pipeline stage...");
  // Map old values to new
  await pool.query(`ALTER TABLE members ALTER COLUMN pipeline_stage DROP DEFAULT`);
  await pool.query(`ALTER TABLE members ALTER COLUMN pipeline_stage TYPE text`);
  await pool.query(`UPDATE members SET pipeline_stage = 'culto' WHERE pipeline_stage IN ('visitante', 'frequentador')`);
  await pool.query(`UPDATE members SET pipeline_stage = 'pequeno_grupo' WHERE pipeline_stage IN ('em_discipulado', 'batizado')`);
  await pool.query(`UPDATE members SET pipeline_stage = 'ministerio' WHERE pipeline_stage IN ('membro_ativo', 'lider')`);
  // Update pipeline history too
  await pool.query(`UPDATE member_pipeline_history SET from_stage = 'culto' WHERE from_stage IN ('visitante', 'frequentador')`);
  await pool.query(`UPDATE member_pipeline_history SET from_stage = 'pequeno_grupo' WHERE from_stage IN ('em_discipulado', 'batizado')`);
  await pool.query(`UPDATE member_pipeline_history SET from_stage = 'ministerio' WHERE from_stage IN ('membro_ativo', 'lider')`);
  await pool.query(`UPDATE member_pipeline_history SET to_stage = 'culto' WHERE to_stage IN ('visitante', 'frequentador')`);
  await pool.query(`UPDATE member_pipeline_history SET to_stage = 'pequeno_grupo' WHERE to_stage IN ('em_discipulado', 'batizado')`);
  await pool.query(`UPDATE member_pipeline_history SET to_stage = 'ministerio' WHERE to_stage IN ('membro_ativo', 'lider')`);
  await pool.query(`DROP TYPE IF EXISTS member_pipeline_stage`);
  await pool.query(`CREATE TYPE member_pipeline_stage AS ENUM ('culto', 'pequeno_grupo', 'ministerio')`);
  await pool.query(`ALTER TABLE members ALTER COLUMN pipeline_stage TYPE member_pipeline_stage USING pipeline_stage::member_pipeline_stage`);
  await pool.query(`ALTER TABLE members ALTER COLUMN pipeline_stage SET DEFAULT 'culto'`);
  console.log("    ✓ Pipeline: culto / pequeno_grupo / ministerio");

  // 2. Member status: old (ativo, inativo, transferido, falecido) → new (visitante, ativo, inativo, falecido)
  console.log("  [2/4] Status do membro...");
  await pool.query(`ALTER TABLE members ALTER COLUMN status DROP DEFAULT`);
  await pool.query(`ALTER TABLE members ALTER COLUMN status TYPE text`);
  await pool.query(`UPDATE members SET status = 'ativo' WHERE status = 'transferido'`);
  await pool.query(`DROP TYPE IF EXISTS member_status`);
  await pool.query(`CREATE TYPE member_status AS ENUM ('visitante', 'ativo', 'inativo', 'falecido')`);
  await pool.query(`ALTER TABLE members ALTER COLUMN status TYPE member_status USING status::member_status`);
  await pool.query(`ALTER TABLE members ALTER COLUMN status SET DEFAULT 'ativo'`);
  console.log("    ✓ Status: visitante / ativo / inativo / falecido");

  // 3. Sex: remove 'outro'
  console.log("  [3/4] Sexo...");
  await pool.query(`ALTER TABLE members ALTER COLUMN sex TYPE text`);
  await pool.query(`UPDATE members SET sex = NULL WHERE sex = 'outro'`);
  await pool.query(`DROP TYPE IF EXISTS member_sex`);
  await pool.query(`CREATE TYPE member_sex AS ENUM ('masculino', 'feminino')`);
  await pool.query(`ALTER TABLE members ALTER COLUMN sex TYPE member_sex USING sex::member_sex`);
  console.log("    ✓ Sexo: masculino / feminino");

  // 4. Add enrollment_type column + enum
  console.log("  [4/4] Tipo de arrolamento...");
  await pool.query(`DO $$ BEGIN CREATE TYPE member_enrollment_type AS ENUM ('batismo', 'profissao_de_fe', 'transferencia', 'jurisdicao', 'restauracao'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  // Add column if not exists
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS enrollment_type member_enrollment_type`);
  console.log("    ✓ Tipo arrolamento: batismo / profissao_de_fe / transferencia / jurisdicao / restauracao");

  console.log("\n✅ Migração de enums concluída.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
