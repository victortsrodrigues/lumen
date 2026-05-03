import { useState } from "react";
import { useListContents, useCreateContent, useDeleteContent } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth-context";
import { FileText, Plus, Loader2, X, Trash2, AlertTriangle, Film } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  pequenos_grupos: "Pequenos Grupos",
  devocionais: "Devocionais",
  escola_biblica: "Escola Bíblica",
  esboco_sermao: "Esboço de Sermão",
  estudo_biblico: "Estudo Bíblico",
};

const CATEGORY_COLORS: Record<string, string> = {
  pequenos_grupos: "bg-green-100 text-green-800",
  devocionais: "bg-purple-100 text-purple-800",
  escola_biblica: "bg-blue-100 text-blue-800",
  esboco_sermao: "bg-amber-100 text-amber-800",
  estudo_biblico: "bg-cyan-100 text-cyan-800",
};

export default function ContentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "leader";

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({ title: "", description: "", category: "pequenos_grupos" });

  const invalidate = () => qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/contents") });

  const { data, isLoading } = useListContents({
    page, limit: 20,
    ...(filterCategory ? { category: filterCategory as any } : {}),
  });

  const createMut = useCreateContent({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Conteúdo criado." });
        setShowCreateModal(false);
        setForm({ title: "", description: "", category: "pequenos_grupos" });
      },
      onError: (err: any) => toast({ title: "Erro", description: err?.response?.data?.error || "Falha.", variant: "destructive" }),
    },
  });

  const deleteMut = useDeleteContent({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Conteúdo removido." });
        setDeleteTarget(null);
      },
    },
  });

  const contents = data?.contents || [];
  const total = data?.total || 0;

  return (
    <AppLayout breadcrumbs={[{ label: "Ensino e Pregação", href: "/teaching" }, { label: "Conteúdos" }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Conteúdos
          </h1>
          <p className="text-muted-foreground text-sm">{total} conteúdo(s)</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Novo Conteúdo
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg bg-background text-sm">
          <option value="">Todas categorias</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {!isLoading && contents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Nenhum conteúdo encontrado.</div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contents.map((c: any) => (
          <div
            key={c.id}
            className="rounded-2xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer relative group"
            onClick={() => setLocation(`/teaching/contents/${c.id}`)}
          >
            <div className="flex items-start justify-between mb-3">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[c.category] || "bg-slate-100"}`}>
                {CATEGORY_LABELS[c.category] || c.category}
              </span>
              {c.mediaCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Film className="h-3 w-3" /> {c.mediaCount}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-base mb-1">{c.title}</h3>
            {c.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
            )}
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : ""}</span>
            </div>

            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: c.id, title: c.title }); }}
                className="absolute bottom-3 right-3 p-1.5 rounded-full text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
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
              <h2 className="text-lg font-bold">Novo Conteúdo</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-sm font-medium">Título *</label>
                <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Categoria *</label>
                <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={3} />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={() => createMut.mutate({ data: form as any })} disabled={!form.title.trim() || createMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Remover Conteúdo</h2>
                  <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <p className="text-sm mb-6">Remover <strong>"{deleteTarget.title}"</strong>?</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button onClick={() => deleteMut.mutate({ id: deleteTarget.id })} disabled={deleteMut.isPending} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                  {deleteMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
