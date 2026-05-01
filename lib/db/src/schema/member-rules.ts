/**
 * Member rules — listas e helpers compartilhados entre backend e frontend.
 *
 * ⚠️ Browser-safe: NÃO importa drizzle-orm, drizzle-zod ou Node APIs.
 * Apenas constantes string e funções puras. Bundleável pelo Vite.
 */

// ─── RECEPTION MODE × CLASSIFICATION ────────────────────────────────────────

export const COMMUNING_RECEPTION_MODES = [
  "profissao_fe",
  "profissao_fe_batismo",
  "carta_transferencia",
  "jurisdicao_pedido",
  "jurisdicao_ex_officio",
  "restauracao",
] as const;

export const NON_COMMUNING_RECEPTION_MODES = [
  "batismo_infantil",
  "transferencia_menor",
  "arrolamento_menor",
] as const;

export const ALL_RECEPTION_MODES = [
  ...COMMUNING_RECEPTION_MODES,
  ...NON_COMMUNING_RECEPTION_MODES,
] as const;

export type ReceptionMode = typeof ALL_RECEPTION_MODES[number];
export type Classification = "comungante" | "nao_comungante";

export function isValidReceptionMode(classification: string, mode: string): boolean {
  if (classification === "comungante") {
    return (COMMUNING_RECEPTION_MODES as readonly string[]).includes(mode);
  }
  if (classification === "nao_comungante") {
    return (NON_COMMUNING_RECEPTION_MODES as readonly string[]).includes(mode);
  }
  return false;
}

// ─── EXCLUSION REASON × CLASSIFICATION ──────────────────────────────────────

export const COMMUNING_EXCLUSION_REASONS = [
  "transferencia",
  "falecimento",
  "exclusao_pedido",
  "exclusao_disciplina",
  "exclusao_abandono",
  "ordenacao_ministerio",
] as const;

export const NON_COMMUNING_EXCLUSION_REASONS = [
  "transferencia_responsaveis",
  "falecimento",
  "profissao_fe_migracao",
  "exclusao_abandono_responsaveis",
] as const;

export type ExclusionReason =
  | typeof COMMUNING_EXCLUSION_REASONS[number]
  | typeof NON_COMMUNING_EXCLUSION_REASONS[number];

export function isValidExclusionReason(classification: string, reason: string): boolean {
  if (classification === "comungante") {
    return (COMMUNING_EXCLUSION_REASONS as readonly string[]).includes(reason);
  }
  if (classification === "nao_comungante") {
    return (NON_COMMUNING_EXCLUSION_REASONS as readonly string[]).includes(reason);
  }
  return false;
}

// ─── LABELS PARA UI (PT-BR) ─────────────────────────────────────────────────

export const RECEPTION_MODE_LABELS: Record<string, string> = {
  profissao_fe: "Profissão de Fé",
  profissao_fe_batismo: "Profissão de Fé e Batismo",
  carta_transferencia: "Carta de Transferência",
  jurisdicao_pedido: "Jurisdição a Pedido",
  jurisdicao_ex_officio: "Jurisdição ex officio",
  restauracao: "Restauração",
  batismo_infantil: "Batismo Infantil",
  transferencia_menor: "Transferência (menor)",
  arrolamento_menor: "Arrolamento (menor)",
};

export const EXCLUSION_REASON_LABELS: Record<string, string> = {
  transferencia: "Transferência",
  falecimento: "Falecimento",
  exclusao_pedido: "Exclusão a Pedido",
  exclusao_disciplina: "Exclusão por Disciplina",
  exclusao_abandono: "Exclusão por Abandono",
  ordenacao_ministerio: "Ordenação ao Ministério",
  transferencia_responsaveis: "Transferência (responsáveis)",
  profissao_fe_migracao: "Profissão de Fé (migração)",
  exclusao_abandono_responsaveis: "Abandono dos Responsáveis",
};
