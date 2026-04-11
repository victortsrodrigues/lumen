import { useState } from "react";
import {
  useListDirectives, useCreateDirective, useUpdateDirective, useDeleteDirective,
  useGetDirectiveDetail, useCreateObjective, useUpdateObjective, useDeleteObjective,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { Target, Plus, Loader2, X, Trash2, Edit2, ChevronDown, ChevronRight } from "lucide-react";

export default function DirectivesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [showCreateDir, setShowCreateDir] = useState(false);
  const [dirForm, setDirForm] = useState({ title: "", description: "", startYear: "2026", endYear: "2028" });
  const [expandedDir, setExpandedDir] = useState<string | null>(null);
  const [showCreateObj, setShowCreateObj] = useState<string | null>(null);
  const [objForm, setObjForm] = useState({ title: "", description: "", targetValue: "", unit: "", deadline: "" });

  const { data, isLoading } = useListDirectives();
  const { data: detailData } = useGetDirectiveDetail(expandedDir!, { query: { enabled: !!expandedDir } });

  const createDirMut = useCreateDirective({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/directives"] }); toast({ title: "Sucesso", description: "Diretriz criada." }); setShowCreateDir(false); setDirForm({ title: "", description: "", startYear: "2026", endYear: "2028" }); }, onError: (e: any) => toast({ title: "Erro", description: e?.response?.data?.error || "Falha.", variant: "destructive" }) } });
  const deleteDirMut = useDeleteDirective({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/directives"] }); toast({ title: "Sucesso", description: "Diretriz removida." }); } } });
  const createObjMut = useCreateObjective({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/directives"] }); toast({ title: "Sucesso", description: "Objetivo criado." }); setShowCreateObj(null); setObjForm({ title: "", description: "", targetValue: "", unit: "", deadline: "" }); }, onError: (e: any) => toast({ title: "Erro", description: e?.response?.data?.error || "Falha.", variant: "destructive" }) } });
  const deleteObjMut = useDeleteObjective({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/directives"] }); toast({ title: "Sucesso", description: "Objetivo removido." }); } } });
  const updateObjMut = useUpdateObjective({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planning/directives"] }); toast({ title: "Sucesso", description: "Objetivo atualizado." }); } } });

  const directives = data?.directives || [];
  const detail = detailData as any;

  return (
    <AppLayout breadcrumbs={[{ label: "Planejamento", href: "/planning" }, { label: "Diretrizes" }]}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6" /> Diretrizes Estratégicas</h1>
        {isAdmin && <button onClick={() => setShowCreateDir(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="h-4 w-4" /> Nova Diretriz</button>}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {!isLoading && directives.length === 0 && <div className="text-center py-12 text-muted-foreground">Nenhuma diretriz cadastrada.</div>}

      <div className="space-y-4">
        {directives.map((d: any) => (
          <div key={d.id} className="rounded-2xl border bg-card overflow-hidden">
            <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-muted/30" onClick={() => setExpandedDir(expandedDir === d.id ? null : d.id)}>
              <div className="flex items-center gap-3">
                {expandedDir === d.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div>
                  <h3 className="font-semibold">{d.title}</h3>
                  <p className="text-xs text-muted-foreground">{d.startYear} — {d.endYear}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.status === "ativa" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"}`}>{d.status}</span>
                {isAdmin && <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remover "${d.title}"?`)) deleteDirMut.mutate({ id: d.id }); }} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>

            {expandedDir === d.id && detail && (
              <div className="border-t p-5 space-y-3">
                {d.description && <p className="text-sm text-muted-foreground mb-4">{d.description}</p>}

                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Objetivos</h4>
                  {isAdmin && <button onClick={() => setShowCreateObj(d.id)} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar</button>}
                </div>

                {(!detail.objectives || detail.objectives.length === 0) && <p className="text-sm text-muted-foreground">Nenhum objetivo.</p>}

                {detail.objectives?.map((o: any) => {
                  const progress = o.targetValue && parseFloat(o.targetValue) > 0 ? Math.min(100, Math.round((parseFloat(o.currentValue || "0") / parseFloat(o.targetValue)) * 100)) : 0;
                  return (
                    <div key={o.id} className="p-3 rounded-xl bg-muted/50">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">{o.title}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${o.status === "concluido" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{o.status}</span>
                          {isAdmin && <button onClick={() => { if (confirm("Remover objetivo?")) deleteObjMut.mutate({ id: o.id }); }} className="p-0.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-3 w-3" /></button>}
                        </div>
                      </div>
                      {o.targetValue && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>{o.currentValue || 0} / {o.targetValue} {o.unit || ""}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className={`h-2 rounded-full ${progress >= 100 ? "bg-green-500" : progress >= 50 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}
                      {o.deadline && <p className="text-xs text-muted-foreground mt-1">Prazo: {new Date(o.deadline).toLocaleDateString("pt-BR")}</p>}
                      {o.initiatives && o.initiatives.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">{o.initiatives.length} iniciativa(s) vinculada(s)</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Directive Modal */}
      {showCreateDir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateDir(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between"><h2 className="text-lg font-bold">Nova Diretriz</h2><button onClick={() => setShowCreateDir(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button></div>
            <div className="p-6 space-y-3">
              <div><label className="text-sm font-medium">Título *</label><input value={dirForm.title} onChange={e => setDirForm(f => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              <div><label className="text-sm font-medium">Descrição</label><textarea value={dirForm.description} onChange={e => setDirForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Ano Início</label><input value={dirForm.startYear} onChange={e => setDirForm(f => ({ ...f, startYear: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
                <div><label className="text-sm font-medium">Ano Fim</label><input value={dirForm.endYear} onChange={e => setDirForm(f => ({ ...f, endYear: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreateDir(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={() => createDirMut.mutate({ data: dirForm as any })} disabled={!dirForm.title.trim() || createDirMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">{createDirMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Objective Modal */}
      {showCreateObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateObj(null)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between"><h2 className="text-lg font-bold">Novo Objetivo</h2><button onClick={() => setShowCreateObj(null)} className="text-muted-foreground"><X className="h-5 w-5" /></button></div>
            <div className="p-6 space-y-3">
              <div><label className="text-sm font-medium">Título *</label><input value={objForm.title} onChange={e => setObjForm(f => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              <div><label className="text-sm font-medium">Descrição</label><textarea value={objForm.description} onChange={e => setObjForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-sm font-medium">Meta</label><input type="number" inputMode="numeric" value={objForm.targetValue} onChange={e => setObjForm(f => ({ ...f, targetValue: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
                <div><label className="text-sm font-medium">Unidade</label><input value={objForm.unit} onChange={e => setObjForm(f => ({ ...f, unit: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="membros" /></div>
                <div><label className="text-sm font-medium">Prazo</label><input type="date" value={objForm.deadline} onChange={e => setObjForm(f => ({ ...f, deadline: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreateObj(null)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={() => createObjMut.mutate({ id: showCreateObj!, data: { ...objForm, targetValue: objForm.targetValue ? Number(objForm.targetValue) : undefined } as any })} disabled={!objForm.title.trim() || createObjMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">{createObjMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Criar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
