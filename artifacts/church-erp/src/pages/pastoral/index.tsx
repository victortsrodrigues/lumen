import { useState } from "react";
import {
  useListPastoralVisits, useCreatePastoralVisit, useUpdatePastoralVisit, useDeletePastoralVisit, useGetPastoralSummary,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MemberSelect } from "@/components/MemberSelect";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import {
  HeartHandshake, Plus, Loader2, X, Trash2, Edit2, Search, AlertTriangle, Phone, Users, BookOpen,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  visita: "Visita", ligacao: "Ligação", reuniao: "Reunião", oracao: "Oração",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", realizado: "Realizado", cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800",
  realizado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
};

const TYPE_ICONS: Record<string, typeof HeartHandshake> = {
  visita: HeartHandshake, ligacao: Phone, reuniao: Users, oracao: BookOpen,
};

const EMPTY_FORM = {
  memberId: "", memberName: "", pastorId: "", pastorName: "",
  type: "visita", date: "", notes: "", followUpDate: "", status: "pendente",
};

export default function PastoralPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  if (user?.role === "member") {
    return (
      <AppLayout breadcrumbs={[{ label: "Acompanhamento Pastoral" }]}>
        <div className="text-center py-12 text-muted-foreground">
          <HeartHandshake className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Você não tem permissão para acessar este módulo.</p>
        </div>
      </AppLayout>
    );
  }

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListPastoralVisits({
    page, limit: 20,
    ...(filterStatus ? { status: filterStatus as any } : {}),
  });

  const { data: summary } = useGetPastoralSummary();

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/pastoral") });
  };

  const createMutation = useCreatePastoralVisit({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Visita registrada." }); closeModal(); },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha ao criar.", variant: "destructive" }); },
    },
  });

  const updateMutation = useUpdatePastoralVisit({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Visita atualizada." }); closeModal(); },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha ao atualizar.", variant: "destructive" }); },
    },
  });

  const deleteMutation = useDeletePastoralVisit({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Visita removida." }); },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha ao remover.", variant: "destructive" }); },
    },
  });

  const closeModal = () => { setShowModal(false); setEditingId(null); setForm({ ...EMPTY_FORM }); };

  const openEdit = (visit: any) => {
    setForm({
      memberId: visit.memberId, memberName: visit.memberName,
      pastorId: visit.pastorId, pastorName: visit.pastorName,
      type: visit.type, date: visit.date,
      notes: visit.notes || "", followUpDate: visit.followUpDate || "",
      status: visit.status,
    });
    setEditingId(visit.id);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.memberId || !form.pastorId || !form.type || !form.date) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { type: form.type as any, date: form.date, notes: form.notes || undefined, status: form.status as any, followUpDate: form.followUpDate || undefined } });
    } else {
      createMutation.mutate({ data: { memberId: form.memberId, pastorId: form.pastorId, type: form.type as any, date: form.date, notes: form.notes || undefined, followUpDate: form.followUpDate || undefined } });
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const visits = data?.visits || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <AppLayout breadcrumbs={[{ label: "Acompanhamento Pastoral" }]}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HeartHandshake className="h-6 w-6" /> Acompanhamento Pastoral
        </h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Nova Visita
        </button>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Visitas</p>
            <p className="text-2xl font-bold">{summary.totalVisits}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-yellow-600">{summary.pending}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Realizadas (Mês)</p>
            <p className="text-2xl font-bold text-green-600">{summary.doneThisMonth}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Follow-ups Atrasados</p>
            <p className={`text-2xl font-bold ${summary.overdueFollowUps > 0 ? "text-red-600" : "text-green-600"}`}>{summary.overdueFollowUps}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* List */}
      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {!isLoading && visits.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <HeartHandshake className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma visita registrada.</p>
        </div>
      )}

      {!isLoading && visits.length > 0 && (
        <div className="space-y-3">
          {visits.map((v: any) => {
            const TypeIcon = TYPE_ICONS[v.type] || HeartHandshake;
            return (
              <div key={v.id} className="rounded-xl border bg-card p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <TypeIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{v.memberName}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[v.status] || ""}`}>
                        {STATUS_LABELS[v.status] || v.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {TYPE_LABELS[v.type]} por {v.pastorName} em {new Date(v.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                    {v.notes && <p className="text-sm mt-1 line-clamp-2">{v.notes}</p>}
                    {v.followUpDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Follow-up: {new Date(v.followUpDate + "T12:00:00").toLocaleDateString("pt-BR")}
                        {v.followUpDate < new Date().toISOString().slice(0, 10) && v.status === "pendente" && (
                          <span className="ml-2 text-red-500 font-medium">Atrasado</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(v)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="Editar">
                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {isAdmin && (
                    <button onClick={() => setDeleteConfirm(v.id)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="Remover">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`px-3 py-1 rounded-lg text-sm ${p === page ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <h3 className="font-semibold text-lg">Remover Visita</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">Tem certeza que deseja remover esta visita pastoral?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">Cancelar</button>
              <button onClick={() => { deleteMutation.mutate({ id: deleteConfirm }); setDeleteConfirm(null); }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700">Remover</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto">
          <div className="bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{editingId ? "Editar Visita" : "Nova Visita Pastoral"}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-muted rounded-lg"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Membro Visitado *</label>
                <MemberSelect value={form.memberId} onChange={(id, name) => setForm(f => ({ ...f, memberId: id, memberName: name }))} placeholder="Buscar membro..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pastor/Líder Responsável *</label>
                <MemberSelect value={form.pastorId} onChange={(id, name) => setForm(f => ({ ...f, pastorId: id, pastorName: name }))} placeholder="Buscar pastor/líder..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo *</label>
                  <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>
              {editingId && (
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none" placeholder="Notas sobre a visita..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Data Follow-up</label>
                <input type="date" value={form.followUpDate} onChange={(e) => setForm(f => ({ ...f, followUpDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50">
                  {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Salvar" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
