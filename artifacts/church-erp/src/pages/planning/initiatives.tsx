import { useState } from "react";
import {
  useListInitiatives, useCreateInitiative, useUpdateInitiative, useDeleteInitiative,
  useGetInitiativeDetail, useAddInitiativeStep, useUpdateInitiativeStep, useDeleteInitiativeStep,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { Target, Plus, Loader2, X, Trash2, Check, Clock, AlertTriangle } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  aquisicao: "Aquisição", reforma: "Reforma", campanha: "Campanha",
  evento_especial: "Evento Especial", capacitacao: "Capacitação",
  missoes: "Missões", administrativo: "Administrativo", outro: "Outro",
};
const PRIORITY_LABELS: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const PRIORITY_COLORS: Record<string, string> = { alta: "bg-red-100 text-red-800", media: "bg-yellow-100 text-yellow-800", baixa: "bg-slate-100 text-slate-800" };
const STATUS_LABELS: Record<string, string> = { planejada: "Planejada", aprovada: "Aprovada", em_andamento: "Em Andamento", concluida: "Concluída", cancelada: "Cancelada" };
const STATUS_COLORS: Record<string, string> = { planejada: "bg-slate-100 text-slate-800", aprovada: "bg-blue-100 text-blue-800", em_andamento: "bg-amber-100 text-amber-800", concluida: "bg-green-100 text-green-800", cancelada: "bg-red-100 text-red-800" };

function formatCurrency(v: string | number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(typeof v === "string" ? parseFloat(v) : v);
}

export default function InitiativesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "leader";

  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newStepTitle, setNewStepTitle] = useState("");

  const [form, setForm] = useState({
    title: "", description: "", type: "outro", priority: "media",
    plannedBudget: "", startDate: "", endDate: "", responsibleId: "", notes: "",
  });

  const { data, isLoading } = useListInitiatives({
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterType ? { type: filterType } : {}),
    ...(filterPriority ? { priority: filterPriority } : {}),
  });

  const { data: detailData } = useGetInitiativeDetail(selectedId!, { query: { enabled: !!selectedId } });

  const createMut = useCreateInitiative({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/initiatives"] }); toast({ title: "Sucesso", description: "Iniciativa criada." }); setShowCreate(false); setForm({ title: "", description: "", type: "outro", priority: "media", plannedBudget: "", startDate: "", endDate: "", responsibleId: "", notes: "" }); } } });
  const updateMut = useUpdateInitiative({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/initiatives"] }); qc.invalidateQueries({ queryKey: ["/api/planning/initiatives"] }); toast({ title: "Sucesso", description: "Atualizado." }); } } });
  const deleteMut = useDeleteInitiative({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/initiatives"] }); setSelectedId(null); toast({ title: "Sucesso", description: "Removida." }); } } });
  const addStepMut = useAddInitiativeStep({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/initiatives"] }); setNewStepTitle(""); } } });
  const updateStepMut = useUpdateInitiativeStep({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/initiatives"] }); } } });
  const deleteStepMut = useDeleteInitiativeStep({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/initiatives"] }); } } });

  const initiatives = data?.initiatives || [];
  const detail = detailData as any;

  const isOverdue = (i: any) => i.endDate && new Date(i.endDate) < new Date() && i.status !== "concluida" && i.status !== "cancelada";

  return (
    <AppLayout breadcrumbs={[{ label: "Planejamento", href: "/planning" }, { label: "Iniciativas" }]}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6" /> Iniciativas</h1>
        {isAdmin && <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="h-4 w-4" /> Nova Iniciativa</button>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg bg-background text-sm">
          <option value="">Todos status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 border rounded-lg bg-background text-sm">
          <option value="">Todos tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="px-3 py-2 border rounded-lg bg-background text-sm">
          <option value="">Todas prioridades</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
      {!isLoading && initiatives.length === 0 && <div className="text-center py-12 text-muted-foreground">Nenhuma iniciativa encontrada.</div>}

      {/* Table */}
      {!isLoading && initiatives.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Título</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Prioridade</th>
                <th className="text-left px-4 py-3 font-medium">Responsável</th>
                {isAdmin && <th className="text-right px-4 py-3 font-medium">Orçamento</th>}
                <th className="text-left px-4 py-3 font-medium">Prazo</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {initiatives.map((i: any) => (
                <tr key={i.id} className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${isOverdue(i) ? "bg-red-50/50" : ""}`} onClick={() => setSelectedId(i.id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isOverdue(i) && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                      <span className="font-medium">{i.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[i.type] || i.type}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[i.priority]}`}>{PRIORITY_LABELS[i.priority]}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{i.responsibleName || "—"}</td>
                  {isAdmin && <td className="px-4 py-3 text-right text-muted-foreground">{i.plannedBudget ? formatCurrency(i.plannedBudget) : "—"}</td>}
                  <td className={`px-4 py-3 ${isOverdue(i) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>{i.endDate ? new Date(i.endDate).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[i.status]}`}>{STATUS_LABELS[i.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedId && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedId(null)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-card rounded-t-2xl">
              <h2 className="text-lg font-bold">{detail.title}</h2>
              <button onClick={() => setSelectedId(null)} className="text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> {TYPE_LABELS[detail.type]}</div>
                <div><span className="text-muted-foreground">Prioridade:</span> <span className={`px-2 py-0.5 rounded-full text-xs ${PRIORITY_COLORS[detail.priority]}`}>{PRIORITY_LABELS[detail.priority]}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[detail.status]}`}>{STATUS_LABELS[detail.status]}</span></div>
                <div><span className="text-muted-foreground">Responsável:</span> {detail.responsibleName || "—"}</div>
                {detail.startDate && <div><span className="text-muted-foreground">Início:</span> {new Date(detail.startDate).toLocaleDateString("pt-BR")}</div>}
                {detail.endDate && <div><span className="text-muted-foreground">Prazo:</span> {new Date(detail.endDate).toLocaleDateString("pt-BR")}</div>}
              </div>

              {/* Budget bar (admin only) */}
              {isAdmin && detail.plannedBudget && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Orçamento</span>
                    <span>{formatCurrency(detail.realizedCost)} / {formatCurrency(detail.plannedBudget)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full ${parseFloat(detail.realizedCost) > parseFloat(detail.plannedBudget) ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, (parseFloat(detail.realizedCost) / parseFloat(detail.plannedBudget)) * 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Status change */}
              {canEdit && (
                <div>
                  <label className="text-sm font-medium">Alterar Status</label>
                  <select value={detail.status} onChange={e => updateMut.mutate({ id: selectedId!, data: { status: e.target.value } })} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Etapas ({detail.progress}% concluído)</h4>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mb-3">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${detail.progress}%` }} />
                </div>
                {detail.steps?.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 py-1.5">
                    <button onClick={() => updateStepMut.mutate({ initiativeId: selectedId!, stepId: s.id, data: { completed: !s.completed } })} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${s.completed ? "bg-green-500 border-green-500 text-white" : "border-border"}`}>
                      {s.completed && <Check className="h-3 w-3" />}
                    </button>
                    <span className={`text-sm flex-1 ${s.completed ? "line-through text-muted-foreground" : ""}`}>{s.title}</span>
                    {isAdmin && <button onClick={() => deleteStepMut.mutate({ initiativeId: selectedId!, stepId: s.id })} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>}
                  </div>
                ))}
                {canEdit && (
                  <div className="flex gap-2 mt-2">
                    <input value={newStepTitle} onChange={e => setNewStepTitle(e.target.value)} placeholder="Nova etapa..." className="flex-1 px-3 py-1.5 border rounded-lg bg-background text-sm" onKeyDown={e => { if (e.key === "Enter" && newStepTitle.trim()) addStepMut.mutate({ id: selectedId!, data: { title: newStepTitle.trim(), sortOrder: (detail.steps?.length || 0) + 1 } }); }} />
                    <button onClick={() => { if (newStepTitle.trim()) addStepMut.mutate({ id: selectedId!, data: { title: newStepTitle.trim(), sortOrder: (detail.steps?.length || 0) + 1 } }); }} disabled={!newStepTitle.trim()} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"><Plus className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t flex justify-between sticky bottom-0 bg-card rounded-b-2xl">
              {isAdmin && <button onClick={() => { if (confirm("Remover iniciativa?")) deleteMut.mutate({ id: selectedId! }); }} className="px-3 py-1.5 border border-destructive text-destructive rounded-lg text-sm hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>}
              <button onClick={() => setSelectedId(null)} className="px-4 py-2 border rounded-lg text-sm ml-auto">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between"><h2 className="text-lg font-bold">Nova Iniciativa</h2><button onClick={() => setShowCreate(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button></div>
            <div className="p-6 space-y-3">
              <div><label className="text-sm font-medium">Título *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              <div><label className="text-sm font-medium">Descrição</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Tipo *</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">Prioridade</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              {isAdmin && (
                <div><label className="text-sm font-medium">Orçamento Previsto (R$)</label><input type="number" inputMode="decimal" step="0.01" value={form.plannedBudget} onChange={e => setForm(f => ({ ...f, plannedBudget: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Início</label><input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
                <div><label className="text-sm font-medium">Prazo</label><input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              </div>
              <div><label className="text-sm font-medium">ID do Responsável</label><input value={form.responsibleId} onChange={e => setForm(f => ({ ...f, responsibleId: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              <div><label className="text-sm font-medium">Observações</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} /></div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={() => { const payload: any = { ...form }; if (!payload.plannedBudget) delete payload.plannedBudget; if (!payload.startDate) delete payload.startDate; if (!payload.endDate) delete payload.endDate; if (!payload.responsibleId) delete payload.responsibleId; if (!payload.notes) delete payload.notes; createMut.mutate({ data: payload }); }} disabled={!form.title.trim() || createMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">{createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Criar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
