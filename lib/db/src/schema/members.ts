import { pgTable, text, timestamp, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memberStatusEnum = pgEnum("member_status", ["visitante", "ativo", "inativo", "falecido"]);
export const memberSexEnum = pgEnum("member_sex", ["masculino", "feminino"]);
export const memberPipelineStageEnum = pgEnum("member_pipeline_stage", [
  "culto", "pequeno_grupo", "ministerio",
]);
export const memberEnrollmentTypeEnum = pgEnum("member_enrollment_type", [
  "batismo", "profissao_de_fe", "transferencia", "jurisdicao", "restauracao",
]);

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

  conversionDate: date("conversion_date"),
  baptismDate: date("baptism_date"),
  enrollmentType: memberEnrollmentTypeEnum("enrollment_type"),

  status: memberStatusEnum("status").notNull().default("ativo"),
  pipelineStage: memberPipelineStageEnum("pipeline_stage").notNull().default("culto"),

  // Object storage path for photo
  photoPath: text("photo_path"),

  // Family grouping
  familyId: text("family_id"),
  familyName: text("family_name"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
