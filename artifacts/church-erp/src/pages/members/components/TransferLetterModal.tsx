import { useState } from "react";
import { useSaveTransferLetter } from "@workspace/api-client-react";
import { FileText, Link2, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { CloudDocumentPreview, isHttpsDocumentUrl } from "@/components/CloudDocumentPreview";
import { useToast } from "@/hooks/use-toast";

interface TransferLetterModalProps {
  memberId: string;
  memberName: string;
  receptionMode: string | null;
  receptionDate: string | null;
  classification: string;
  onClose: () => void;
}

const RECEPTION_MODE_LABELS: Record<string, string> = {
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

export function TransferLetterModal({
  memberId, memberName, receptionMode, receptionDate, classification, onClose,
}: TransferLetterModalProps) {
  const { toast } = useToast();
  const [letterUrl, setLetterUrl] = useState("");
  const [destinationChurch, setDestinationChurch] = useState("");
  const [responsiblePastor, setResponsiblePastor] = useState("");
  const [secretary, setSecretary] = useState("");
  const [notes, setNotes] = useState("");

  const saveMutation = useSaveTransferLetter();
  const validUrl = isHttpsDocumentUrl(letterUrl);

  async function handleSave() {
    if (!validUrl) {
      toast({
        title: "URL inválida",
        description: "Informe uma URL completa iniciada por https://.",
        variant: "destructive",
      });
      return;
    }
    if (!destinationChurch.trim()) return;

    try {
      await saveMutation.mutateAsync({
        id: memberId,
        data: {
          letterPath: letterUrl.trim(),
          destinationChurch: destinationChurch.trim(),
          responsiblePastor: responsiblePastor.trim() || undefined,
          secretary: secretary.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });

      toast({ title: "Carta de transferência vinculada" });
      onClose();
    } catch {
      // O tratamento global exibe a mensagem segura retornada pela API.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileText className="h-5 w-5 text-primary" /> Carta de Transferência
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Membro: <strong className="text-foreground">{memberName}</strong>
            <br />
            Classificação: {classification === "comungante" ? "Comungante" : "Não comungante"}
            <br />
            Modo de recepção: {receptionMode ? RECEPTION_MODE_LABELS[receptionMode] : "—"}
            {receptionDate && (<><br />Data de recepção: {format(new Date(receptionDate), "dd/MM/yyyy")}</>)}
          </div>

          <div>
            <label className="text-sm font-medium">URL do documento *</label>
            <input
              type="url"
              value={letterUrl}
              onChange={(event) => setLetterUrl(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
              placeholder="https://drive.google.com/..."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use a URL HTTPS do PDF armazenado na nuvem e permita o acesso às pessoas autorizadas.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Igreja Destino *</label>
            <input
              value={destinationChurch}
              onChange={(event) => setDestinationChurch(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
              placeholder="Ex: Igreja Presbiteriana de São Paulo"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Pastor responsável</label>
              <input
                value={responsiblePastor}
                onChange={(event) => setResponsiblePastor(event.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                placeholder="Rev. Nome"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Secretário(a)</label>
              <input
                value={secretary}
                onChange={(event) => setSecretary(event.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                placeholder="Nome"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>

          {validUrl && (
            <CloudDocumentPreview url={letterUrl} title={`Carta de transferência — ${memberName}`} />
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-card p-6">
          <button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!validUrl || !destinationChurch.trim() || saveMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Salvar documento
          </button>
        </div>
      </div>
    </div>
  );
}
