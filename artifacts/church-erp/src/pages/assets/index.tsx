import { useState } from "react";
import {
  useListAssets, useCreateAsset, useUpdateAsset, useDeleteAsset, useGetAssetsSummary,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MediaSection } from "@/components/MediaSection";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import {
  Package, Plus, Loader2, X, Trash2, Edit2, Search,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  instrumento: "Instrumento", som_iluminacao: "Som/Iluminação",
  mobiliario: "Mobiliário", informatica: "Informática",
  veiculo: "Veículo", imovel: "Imóvel", outro: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo", manutencao: "Manutenção", baixa: "Baixa", emprestado: "Emprestado",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-100 text-green-800",
  manutencao: "bg-yellow-100 text-yellow-800",
  baixa: "bg-red-100 text-red-800",
  emprestado: "bg-blue-100 text-blue-800",
};

const EMPTY_FORM = {
  name: "", description: "", category: "outro", acquisitionDate: "",
  acquisitionValue: "", currentValue: "", serialNumber: "", location: "",
  responsibleId: "", status: "ativo", notes: "",
};

export default function AssetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListAssets({
    page, limit: 20,
    ...(filterCategory ? { category: filterCategory as any } : {}),
    ...(filterStatus ? { status: filterStatus as any } : {}),
    ...(search ? { search } : {}),
  });

  const { data: summary } = useGetAssetsSummary({ query: { enabled: isAdmin } });

  const createMutation = useCreateAsset({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        toast({ title: "Sucesso", description: "Bem cadastrado." });
        closeModal();
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.error || "Falha ao criar.", variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateAsset({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        toast({ title: "Sucesso", description: "Bem atualizado." });
        closeModal();
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.error || "Falha ao atualizar.", variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteAsset({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        toast({ title: "Sucesso", description: "Bem removido." });
      },
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setDetailId(null);
    setForm({ ...EMPTY_FORM });
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setDetailId(null);
    setShowModal(true);
  };

  const openEdit = (a: any) => {
    setForm({
      name: a.name || "", description: a.description || "", category: a.category || "outro",
      acquisitionDate: a.acquisitionDate || "", acquisitionValue: a.acquisitionValue || "",
      currentValue: a.currentValue || "", serialNumber: a.serialNumber || "",
      location: a.location || "", responsibleId: a.responsibleId || "",
      status: a.status || "ativo", notes: a.notes || "",
    });
    setEditingId(a.id);
    setDetailId(a.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.location.trim()) return;
    const payload = { ...form } as any;
    if (!payload.acquisitionDate) delete payload.acquisitionDate;
    if (!payload.acquisitionValue) delete payload.acquisitionValue;
    if (!payload.currentValue) delete payload.currentValue;
    if (!payload.serialNumber) delete payload.serialNumber;
    if (!payload.responsibleId) delete payload.responsibleId;
    if (!payload.notes) delete payload.notes;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Remover "${name}"?`)) return;
    deleteMutation.mutate({ id });
  };

  const assets = data?.assets || [];
  const total = data?.total || 0;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout breadcrumbs={[{ label: "Patrimônio" }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" /> Patrimônio
          </h1>
          <p className="text-muted-foreground text-sm">{total} bem(ns) cadastrado(s)</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Novo Bem
          </button>
        )}
      </div>

      {/* Summary */}
      {isAdmin && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total de Bens</p>
            <p className="text-2xl font-bold">{summary.totalAssets}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Valor Total</p>
            <p className="text-2xl font-bold">R$ {parseFloat(summary.totalValue || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nome ou nº série"
            className="pl-9 pr-3 py-2 border rounded-lg bg-background text-sm w-64"
          />
        </div>
        <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg bg-background text-sm">
          <option value="">Todas categorias</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg bg-background text-sm">
          <option value="">Todos status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && assets.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Nenhum bem encontrado.</div>
      )}

      {/* Table */}
      {!isLoading && assets.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">Categoria</th>
                <th className="text-left px-4 py-3 font-medium">Localização</th>
                <th className="text-left px-4 py-3 font-medium">Responsável</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                {isAdmin && <th className="px-4 py-3 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {assets.map((a: any) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(a)}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.name}</p>
                    {a.serialNumber && <p className="text-xs text-muted-foreground">Nº {a.serialNumber}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{CATEGORY_LABELS[a.category] || a.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.location}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.responsibleName || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || ""}`}>
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {a.currentValue || a.acquisitionValue
                      ? `R$ ${parseFloat(a.currentValue || a.acquisitionValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleDelete(a.id, a.name)} className="p-1 text-destructive hover:bg-destructive/10 rounded" title="Remover">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Anterior</button>
          <span className="px-3 py-1 text-sm text-muted-foreground">Página {page}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Próxima</button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-card rounded-t-2xl">
              <h2 className="text-lg font-bold">{editingId ? "Editar Bem" : "Novo Bem"}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-sm font-medium">Nome *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Teclado Yamaha PSR-S975" />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Localização *</label>
                <input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Sala de Ensaio" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Data Aquisição</label>
                  <input type="date" value={form.acquisitionDate} onChange={(e) => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Nº Série</label>
                  <input value={form.serialNumber} onChange={(e) => setForm(f => ({ ...f, serialNumber: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Valor Aquisição (R$)</label>
                  <input type="number" inputMode="decimal" step="0.01" value={form.acquisitionValue} onChange={(e) => setForm(f => ({ ...f, acquisitionValue: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Valor Atual (R$)</label>
                  <input type="number" inputMode="decimal" step="0.01" value={form.currentValue} onChange={(e) => setForm(f => ({ ...f, currentValue: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">ID do Responsável</label>
                <input value={form.responsibleId} onChange={(e) => setForm(f => ({ ...f, responsibleId: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="ID do membro responsável" />
              </div>
              <div>
                <label className="text-sm font-medium">Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} />
              </div>

              {/* Media section for editing */}
              {editingId && detailId && (
                <div className="pt-3 border-t">
                  <MediaSection entityType="asset" entityId={detailId} canEdit />
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end gap-3 sticky bottom-0 bg-card rounded-b-2xl">
              <button onClick={closeModal} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={isPending || !form.name.trim() || !form.location.trim()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
