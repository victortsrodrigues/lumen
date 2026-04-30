import { useState } from "react";
import { useRegisterMemberExclusion } from "@workspace/api-client-react";
import { X, AlertTriangle, Loader2 } from "lucide-react";

const COMMUNING_REASONS: Array<{ value: string; label: string }> = [
  { value: "transferencia", label: "Transferência (gera carta)" },
  { value: "falecimento", label: "Falecimento" },
  { value: "exclusao_pedido", label: "Exclusão a Pedido" },
  { value: "exclusao_disciplina", label: "Exclusão por Disciplina" },
  { value: "exclusao_abandono", label: "Exclusão por Abandono/Ausência" },
  { value: "ordenacao_ministerio", label: "Ordenação ao Ministério" },
];

const NON_COMMUNING_REASONS: Array<{ value: string; label: string }> = [
  { value: "transferencia_responsaveis", label: "Transferência (acompanha responsáveis)" },
  { value: "falecimento", label: "Falecimento" },
  { value: "profissao_fe_migracao", label: "Profissão de Fé (migra para comungante)" },
  { value: "exclusao_abandono_responsaveis", label: "Exclusão por Abandono dos Responsáveis" },
];

interface ExclusionModalProps {
  memberId: string;
  memberName: string;
  classification: "comungante" | "nao_comungante";
  onClose: () => void;
  onTransferSuccess?: () => void; // chain to TransferLetterModal
}

export function ExclusionModal({ memberId, memberName, classification, onClose, onTransferSuccess }: ExclusionModalProps) {
  const reasons = classification === "comungante" ? COMMUNING_REASONS : NON_COMMUNING_REASONS;
  const [reason, setReason] = useState(reasons[0].value);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const mutation = useRegisterMemberExclusion();

  const isMigracao = reason === "profissao_fe_migracao";
  const isTransferencia = reason === "transferencia";

  function handleSave() {
    mutation.mutate(
      { id: memberId, data: { reason: reason as any, date, notes: notes || undefined } },
      {
        onSuccess: () => {
          if (isTransferencia && onTransferSuccess) {
            onTransferSuccess();
          } else {
            onClose();
          }
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Registrar Exclusão
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Membro: <span className="font-medium text-foreground">{memberName}</span> · {classification === "comungante" ? "Comungante" : "Não Comungante"}
          </p>

          <div>
            <label className="text-sm font-medium">Motivo *</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
              {reasons.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {isMigracao && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900 p-3 text-sm text-blue-900 dark:text-blue-200">
              ℹ️ <strong>Migração:</strong> o membro será movido para o rol de comungantes (modo de recepção: Profissão de Fé). O status NÃO será alterado para "demitido".
            </div>
          )}

          {isTransferencia && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-200">
              📄 Após salvar, será aberto o modal para gerar a <strong>Carta de Transferência</strong> (PDF).
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Data *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>

          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Detalhes do caso, processo eclesiástico, etc." />
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isMigracao ? "Migrar" : "Registrar Exclusão"}
          </button>
        </div>
      </div>
    </div>
  );
}
