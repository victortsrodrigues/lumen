import { useState } from "react";
import {
  useListServiceRoles, useCreateServiceRole, useUpdateServiceRole, useDeleteServiceRole,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import {
  CalendarCheck, Plus, Loader2, X, Trash2, Edit2, Save,
} from "lucide-react";

export default function ServiceRolesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", ministryId: "" });

  const { data, isLoading } = useListServiceRoles();

  const createMutation = useCreateServiceRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
        toast({ title: "Sucesso", description: "Função criada." });
        closeModal();
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.error || "Falha.", variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateServiceRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
        toast({ title: "Sucesso", description: "Função atualizada." });
        closeModal();
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.error || "Falha.", variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteServiceRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
        toast({ title: "Sucesso", description: "Função removida." });
      },
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm({ name: "", description: "", ministryId: "" });
  };

  const openCreate = () => {
    setForm({ name: "", description: "", ministryId: "" });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (r: any) => {
    setForm({ name: r.name || "", description: r.description || "", ministryId: r.ministryId || "" });
    setEditingId(r.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const payload: any = { name: form.name.trim() };
    if (form.description) payload.description = form.description;
    if (form.ministryId) payload.ministryId = form.ministryId;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Remover a função "${name}"?`)) return;
    deleteMutation.mutate({ id });
  };

  const roles = data?.roles || [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout breadcrumbs={[{ label: "Escalas" }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarCheck className="h-6 w-6" /> Funções de Serviço
          </h1>
          <p className="text-muted-foreground text-sm">{roles.length} função(ões) cadastrada(s)</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nova Função
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && roles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Nenhuma função cadastrada.</div>
      )}

      {!isLoading && roles.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">Descrição</th>
                <th className="text-left px-4 py-3 font-medium">Ministério</th>
                {isAdmin && <th className="px-4 py-3 w-24"></th>}
              </tr>
            </thead>
            <tbody>
              {roles.map((r: any) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.description || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.ministryName || "—"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Editar">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id, r.name)} className="p-1 text-destructive hover:bg-destructive/10 rounded" title="Remover">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingId ? "Editar Função" : "Nova Função"}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-sm font-medium">Nome *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Ex: Louvor, Som, Recepção" />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} />
              </div>
              <div>
                <label className="text-sm font-medium">ID do Ministério (opcional)</label>
                <input value={form.ministryId} onChange={(e) => setForm(f => ({ ...f, ministryId: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Vincular a um ministério" />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={isPending || !form.name.trim()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
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
