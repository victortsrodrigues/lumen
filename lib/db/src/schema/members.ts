import { pgTable, text, timestamp, pgEnum, date, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── ENUMS ──────────────────────────────────────────────────────────────────

export const memberStatusEnum = pgEnum("member_status", [
  "ativo",
  "disciplina",
  "rol_apartado",
  "falecido",
  "demitido",
]);

export const memberSexEnum = pgEnum("member_sex", ["masculino", "feminino"]);

export const memberClassificationEnum = pgEnum("member_classification", [
  "comungante",
  "nao_comungante",
]);

export const memberReceptionModeEnum = pgEnum("member_reception_mode", [
  // Comungantes
  "profissao_fe",
  "profissao_fe_batismo",
  "carta_transferencia",
  "jurisdicao_pedido",
  "jurisdicao_ex_officio",
  "restauracao",
  // Não comungantes
  "batismo_infantil",
  "transferencia_menor",
  "arrolamento_menor",
]);

export const memberMaritalStatusEnum = pgEnum("member_marital_status", [
  "solteiro",
  "casado",
  "viuvo",
  "divorciado",
  "uniao_estavel",
]);

export const memberExclusionReasonEnum = pgEnum("member_exclusion_reason", [
  // Comungantes
  "transferencia",
  "falecimento",
  "exclusao_pedido",
  "exclusao_disciplina",
  "exclusao_abandono",
  "ordenacao_ministerio",
  // Não comungantes
  "transferencia_responsaveis",
  "profissao_fe_migracao",
  "exclusao_abandono_responsaveis",
]);

// ─── MEMBERS TABLE ──────────────────────────────────────────────────────────

export const membersTable = pgTable("members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fullName: text("full_name").notNull(),

  // Encrypted fields (AES-256-GCM) — stored as base64
  cpfEncrypted: text("cpf_encrypted"),
  // SHA-256 hash of normalized CPF for indexed search
  cpfHash: text("cpf_hash"),

  dateOfBirth: date("date_of_birth"),
  sex: memberSexEnum("sex"),

  // Encrypted fields
  phoneEncrypted: text("phone_encrypted"),
  email: text("email"),

  // Address — encrypted
  addressZipEncrypted: text("address_zip_encrypted"),
  addressStreetEncrypted: text("address_street_encrypted"),
  addressNumber: text("address_number"),
  addressComplement: text("address_complement"),
  addressNeighborhoodEncrypted: text("address_neighborhood_encrypted"),
  addressCity: text("address_city"),
  addressState: text("address_state"),

  // ─── Eclesiástico ───
  classification: memberClassificationEnum("classification").notNull().default("comungante"),
  receptionMode: memberReceptionModeEnum("reception_mode"),
  receptionDate: date("reception_date"),
  conversionDate: date("conversion_date"),
  conversionYear: integer("conversion_year"),
  religiousOrigin: text("religious_origin"),
  infantBaptism: boolean("infant_baptism").notNull().default(false),
  infantBaptismChurch: text("infant_baptism_church"),
  infantBaptismPastor: text("infant_baptism_pastor"),
  parentsOrGuardians: text("parents_or_guardians"),

  // ─── Pessoal ───
  maritalStatus: memberMaritalStatusEnum("marital_status"),
  spouseMemberId: text("spouse_member_id"),
  academicEducation: text("academic_education"),
  profession: text("profession"),

  // ─── Status / exclusão ───
  status: memberStatusEnum("status").notNull().default("ativo"),
  exclusionReason: memberExclusionReasonEnum("exclusion_reason"),
  exclusionDate: date("exclusion_date"),
  exclusionNotes: text("exclusion_notes"),
  exclusionLetterPath: text("exclusion_letter_path"),

  // Object storage path for photo
  photoPath: text("photo_path"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
}, (table) => [
  index("idx_members_classification").on(table.classification),
  index("idx_members_status").on(table.status),
  index("idx_members_spouse").on(table.spouseMemberId),
]);

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
