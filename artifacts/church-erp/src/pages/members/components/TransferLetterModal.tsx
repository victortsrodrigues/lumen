import { useState } from "react";
import { useSaveTransferLetter, useRequestUploadUrl } from "@workspace/api-client-react";
import { X, FileText, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const [destinationChurch, setDestinationChurch] = useState("");
  const [responsiblePastor, setResponsiblePastor] = useState("");
  const [secretary, setSecretary] = useState("");
  const [bookNumber, setBookNumber] = useState("");
  const [folio, setFolio] = useState("");
  const [assemblyDate, setAssemblyDate] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  const saveMutation = useSaveTransferLetter();
  const requestUpload = useRequestUploadUrl();

  function buildPdfBlob(): Blob {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 60;
    let y = 80;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("CARTA DE TRANSFERÊNCIA", pageWidth / 2, y, { align: "center" });
    y += 40;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Data: ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`, pageWidth - margin, y, { align: "right" });
    y += 30;

    // Body
    const receptionLabel = receptionMode ? (RECEPTION_MODE_LABELS[receptionMode] || receptionMode) : "—";
    const receptionDateLabel = receptionDate
      ? format(new Date(receptionDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      : "—";

    doc.setFontSize(12);
    const body = [
      `Atestamos para os devidos fins que ${memberName.toUpperCase()},`,
      `${classification === "comungante" ? "membro(a) comungante" : "arrolado(a) como não-comungante"} desta igreja,`,
      `recebido(a) por ${receptionLabel} em ${receptionDateLabel},`,
      `encontra-se em plena comunhão e em paz com esta igreja, ora se transferindo`,
      `para ${destinationChurch || "[igreja destino]"}.`,
    ];

    for (const line of body) {
      doc.text(line, margin, y, { maxWidth: pageWidth - 2 * margin });
      y += 22;
    }

    y += 30;

    if (notes) {
      doc.setFont("helvetica", "italic");
      doc.text("Observações:", margin, y);
      y += 18;
      doc.setFont("helvetica", "normal");
      const noteLines = doc.splitTextToSize(notes, pageWidth - 2 * margin);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 16 + 20;
    }

    if (bookNumber || folio || assemblyDate) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      const refLines: string[] = [];
      if (assemblyDate) refLines.push(`Assembleia/Conselho: ${format(new Date(assemblyDate), "dd/MM/yyyy")}`);
      if (bookNumber) refLines.push(`Livro de Atas nº ${bookNumber}`);
      if (folio) refLines.push(`Fólio: ${folio}`);
      doc.text(refLines.join("    ·    "), margin, y);
      y += 30;
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
    }

    // Signatures
    y = Math.max(y, 600);
    const signX1 = margin + 50;
    const signX2 = pageWidth - margin - 200;

    doc.line(signX1, y, signX1 + 200, y);
    doc.line(signX2, y, signX2 + 200, y);
    y += 14;
    doc.setFontSize(10);
    doc.text(responsiblePastor || "Pastor responsável", signX1 + 100, y, { align: "center" });
    doc.text(secretary || "Secretário(a) do Conselho", signX2 + 100, y, { align: "center" });

    return doc.output("blob");
  }

  async function handleGenerate() {
    if (!destinationChurch.trim()) return;
    setGenerating(true);
    try {
      const blob = buildPdfBlob();
      const fileName = `carta-transferencia-${memberName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });

      const { uploadURL, objectPath } = await requestUpload.mutateAsync({
        data: { name: fileName, size: file.size, contentType: "application/pdf" },
      });

      await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });

      await saveMutation.mutateAsync({
        id: memberId,
        data: {
          letterPath: objectPath,
          destinationChurch,
          responsiblePastor: responsiblePastor || undefined,
          secretary: secretary || undefined,
          notes: notes || undefined,
        },
      });

      // Trigger download for admin too
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      // global error toast handled by MutationCache
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border shadow-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-card">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Gerar Carta de Transferência
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Membro: <strong className="text-foreground">{memberName}</strong>
            <br />
            Modo de recepção: {receptionMode ? RECEPTION_MODE_LABELS[receptionMode] : "—"}
            {receptionDate && (<><br />Data de recepção: {format(new Date(receptionDate), "dd/MM/yyyy")}</>)}
          </div>

          <div>
            <label className="text-sm font-medium">Igreja Destino *</label>
            <input value={destinationChurch} onChange={(e) => setDestinationChurch(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Ex: Igreja Presbiteriana de São Paulo" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Pastor responsável</label>
              <input value={responsiblePastor} onChange={(e) => setResponsiblePastor(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Rev. Nome" />
            </div>
            <div>
              <label className="text-sm font-medium">Secretário(a)</label>
              <input value={secretary} onChange={(e) => setSecretary(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Nome" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Livro de Atas</label>
              <input value={bookNumber} onChange={(e) => setBookNumber(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="nº" />
            </div>
            <div>
              <label className="text-sm font-medium">Fólio</label>
              <input value={folio} onChange={(e) => setFolio(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">Data Assembleia</label>
              <input type="date" value={assemblyDate} onChange={(e) => setAssemblyDate(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-3 sticky bottom-0 bg-card">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
          <button
            onClick={handleGenerate}
            disabled={!destinationChurch.trim() || generating || saveMutation.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {(generating || saveMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            <FileText className="h-4 w-4" /> Gerar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
