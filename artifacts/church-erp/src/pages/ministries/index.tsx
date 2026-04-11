import { useState } from "react";
import { useListMinistries, useCreateMinistry, useDeleteMinistry } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth-context";
import {
  UsersRound, Plus, Loader2, X, Trash2, AlertTriangle,
} from "lucide-react";

export default function MinistriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({
    name: "", description: "",
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/ministries"] });

  const { data, isLoading } = useListMinistries({
    page,
    limit: 20,
    ...(filterStatus ? { status: filterStatus as any } : {}),
  });

  const createMutation = useCreateMinistry({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Ministério criado." });
        setShowCreateModal(false);
        setForm({ name: "", description: "" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || "Falha ao criar ministério.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteMinistry({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Ministério removido." });
        setDeleteTarget(null);
      },
    },
  });

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createMutation.mutate({ data: form as any });
  };

  const ministries = data?.ministries || [];
  const total = data?.total || 0;

  return (
    <AppLayout breadcrumbs={[{ label: "Ministérios" }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6" /> Ministérios
          </h1>
          <p className="text-muted-foreground text-sm">{total} ministério(s)</p>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Novo Ministério
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg bg-background text-sm"
        >
          <option value="">Todos status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && ministries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nenhum ministério encontrado.
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ministries.map((m: any) => (
          <div
            key={m.id}
            className="rounded-2xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer relative group"
            onClick={() => setLocation(`/ministries/${m.id}`)}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-base">{m.name}</h3>
            </div>

            {m.leaders && m.leaders.length > 0 && (
              <p className="text-sm text-muted-foreground mb-2">
                Líder: {m.leaders.map((l: any) => l.memberName || "—").join(", ")}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <UsersRound className="h-3.5 w-3.5" /> {m.memberCount} membro(s)
              </span>
            </div>

            {m.status === "inativo" && (
              <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                Inativo
              </span>
            )}

            {user?.role === "admin" && (
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: m.id, name: m.name }); }}
                className="absolute bottom-3 right-3 p-1.5 rounded-full text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Anterior</button>
          <span className="px-3 py-1 text-sm text-muted-foreground">Página {page}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Próxima</button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Novo Ministério</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-sm font-medium">Nome *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Ex: Ministério de Louvor" />
              </div>
              <div>
                <label className="text-sm font-medium">Informações</label>
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleCreate} disabled={createMutation.isPending || !form.name.trim()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Remover Ministério</h2>
                  <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <p className="text-sm mb-6">
                Tem certeza que deseja remover o ministério <strong>"{deleteTarget.name}"</strong>?
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button
                  onClick={() => deleteMutation.mutate({ id: deleteTarget.id })}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
