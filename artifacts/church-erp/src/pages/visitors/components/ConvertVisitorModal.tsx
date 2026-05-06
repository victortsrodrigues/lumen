import { useState } from "react";
import { useConvertVisitor } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { X, AlertTriangle, Loader2, ArrowRight } from "lucide-react";

interface ConvertVisitorModalProps {
  visitor: any;
  onClose: () => void;
}

export function ConvertVisitorModal({ visitor, onClose }: ConvertVisitorModalProps) {
  const [, setLocation] = useLocation();
  const mutation = useConvertVisitor();

  const [classification, setClassification] = useState<"comungante" | "nao_comungante">("comungante");
  const [receptionMode, setReceptionMode] = useState<string>("");
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10));
  const [conversionYear, setConversionYear] = useState("");
  const [religiousOrigin, setReligiousOrigin] = useState("");
  const [infantBaptism, setInfantBaptism] = useState(false);
  const [infantBaptismChurch, setInfantBaptismChurch] = useState("");
  const [infantBaptismPastor, setInfantBaptismPastor] = useState("");
  const [parentsOrGuardians, setParentsOrGuardians] = useState("");
  const [cpf, setCpf] = useState("");

  const COMMUNING = [
    { v: "profissao_fe", l: "Profissão de Fé", d: "Para batizados na infância" },
    { v: "profissao_fe_batismo", l: "Profissão de Fé e Batismo", d: "Para novos convertidos" },
    { v: "carta_transferencia", l: "Carta de Transferência", d: "Oriundos de outra IPB ou denominação evangélica" },
    { v: "jurisdicao_pedido", l: "Jurisdição a Pedido", d: "Oriundos de outra igreja evangélica sem carta" },
    { v: "jurisdicao_ex_officio", l: "Jurisdição ex officio", d: "Membro de outra IPB residente no local há mais de um ano" },
    { v: "restauracao", l: "Restauração", d: "Retorno após disciplina ou solicitação prévia de saída" },
  ];
  const NON_COMMUNING = [
    { v: "batismo_infantil", l: "Batismo Infantil", d: "Filhos de membros comungantes" },
    { v: "transferencia_menor", l: "Transferência (menor)", d: "Menores que acompanham os pais transferidos" },
    { v: "arrolamento_menor", l: "Arrolamento (menor)", d: "Menores dependentes sob cuidado do Conselho" },
  ];

  const modes = classification === "comungante" ? COMMUNING : NON_COMMUNING;
  const selectedMode = modes.find(m => m.v === receptionMode);

  function handleConvert() {
    const payload: any = {
      classification,
      receptionMode: receptionMode || undefined,
      receptionDate: receptionDate || undefined,
      conversionYear: conversionYear ? Number(conversionYear) : undefined,
      religiousOrigin: religiousOrigin || undefined,
      infantBaptism: infantBaptism || undefined,
      infantBaptismChurch: infantBaptism ? (infantBaptismChurch || undefined) : undefined,
      infantBaptismPastor: infantBaptism ? (infantBaptismPastor || undefined) : undefined,
      parentsOrGuardians: classification === "nao_comungante" ? (parentsOrGuardians || undefined) : undefined,
      cpf: cpf || undefined,
    };

    mutation.mutate(
      { id: visitor.id, data: payload },
      {
        onSuccess: (member: any) => {
          setLocation(`/members/${member.id}`);
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border shadow-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-card">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" /> Converter em Membro
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <strong>Ação irreversível.</strong> Após converter, o registro do visitante (incluindo histórico de visitas) será <strong>removido permanentemente</strong>. Apenas o histórico no membro recém-criado fica registrado.
              <br /><br />
              Configure cônjuge, filhos e agrupamentos editando o membro após a conversão.
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">Convertendo:</p>
            <p className="font-semibold">{visitor.fullName}</p>
            {visitor.firstVisitDate && (
              <p className="text-xs text-muted-foreground">Primeira visita: {new Date(visitor.firstVisitDate).toLocaleDateString("pt-BR")} · Total {visitor.totalVisits} visita{visitor.totalVisits === 1 ? "" : "s"}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Classificação *</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <input type="radio" checked={classification === "comungante"} onChange={() => setClassification("comungante")} />
                <span className="text-sm">Comungante</span>
              </label>
              <label className="flex-1 flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <input type="radio" checked={classification === "nao_comungante"} onChange={() => setClassification("nao_comungante")} />
                <span className="text-sm">Não Comungante</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Modo de Recepção</label>
            <select value={receptionMode} onChange={(e) => setReceptionMode(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
              <option value="">Selecione...</option>
              {modes.map((m) => <option key={m.v} value={m.v} title={m.d}>{m.l}</option>)}
            </select>
            {selectedMode && (
              <p className="text-xs text-muted-foreground mt-1">{selectedMode.d}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Data de Recepção</label>
              <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">Ano de Conversão</label>
              <input type="number" min="1900" max="2100" value={conversionYear} onChange={(e) => setConversionYear(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">Procedência Religiosa</label>
              <input value={religiousOrigin} onChange={(e) => setReligiousOrigin(e.target.value)} placeholder="Ex: Igreja Batista" className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">CPF (opcional)</label>
            <input value={cpf} onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="00000000000" className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>

          <div className="border rounded-lg p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={infantBaptism} onChange={(e) => setInfantBaptism(e.target.checked)} />
              <span className="text-sm font-medium">Houve batismo na infância</span>
            </label>
            {infantBaptism && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs text-muted-foreground">Igreja</label>
                  <input value={infantBaptismChurch} onChange={(e) => setInfantBaptismChurch(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Pastor</label>
                  <input value={infantBaptismPastor} onChange={(e) => setInfantBaptismPastor(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
                </div>
              </div>
            )}
          </div>

          {classification === "nao_comungante" && (
            <div>
              <label className="text-sm font-medium">Pais ou Responsáveis</label>
              <input value={parentsOrGuardians} onChange={(e) => setParentsOrGuardians(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-end gap-3 sticky bottom-0 bg-card">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
          <button
            onClick={handleConvert}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <ArrowRight className="h-4 w-4" /> Converter
          </button>
        </div>
      </div>
    </div>
  );
}
