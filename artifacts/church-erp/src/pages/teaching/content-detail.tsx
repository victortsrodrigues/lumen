import { useState } from "react";
import { useGetContentDetail, useUpdateContent, useDeleteContent } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MediaSection } from "@/components/MediaSection";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth-context";
import { FileText, Loader2, X, Edit2, Trash2, AlertTriangle, Download } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  pequenos_grupos: "Pequenos Grupos",
  devocionais: "Devocionais",
  escola_biblica: "Escola Bíblica",
  esboco_sermao: "Esboço de Sermão",
  estudo_biblico: "Estudo Bíblico",
};

export default function ContentDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "leader";

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", category: "" });

  const { data, isLoading, isError } = useGetContentDetail(params.id!, {
    query: { enabled: !!params.id },
  });

  const invalidate = () => qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/contents") });

  const updateMut = useUpdateContent({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Conteúdo atualizado." });
        setShowEditModal(false);
      },
    },
  });

  const deleteMut = useDeleteContent({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Conteúdo removido." });
        setLocation("/teaching/contents");
      },
    },
  });

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Conteúdos", href: "/teaching/contents" }, { label: "Carregando..." }]}>
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Conteúdos", href: "/teaching/contents" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-muted-foreground">Conteúdo não encontrado.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Conteúdos", href: "/teaching/contents" }, { label: data.title }]}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              data.category === "pequenos_grupos" ? "bg-green-100 text-green-800" :
              data.category === "devocionais" ? "bg-purple-100 text-purple-800" :
              data.category === "escola_biblica" ? "bg-blue-100 text-blue-800" :
              data.category === "esboco_sermao" ? "bg-amber-100 text-amber-800" :
              "bg-cyan-100 text-cyan-800"
            }`}>
              {CATEGORY_LABELS[data.category!] || data.category}
            </span>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> {data.title}
          </h1>
          {data.createdAt && (
            <p className="text-sm text-muted-foreground mt-1">
              Publicado em {new Date(data.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditForm({ title: data.title || "", description: data.description || "", category: data.category || "" }); setShowEditModal(true); }}
              className="flex items-center gap-1 px-4 py-2 border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
            >
              <Edit2 className="h-4 w-4" /> Editar
            </button>
            <button onClick={() => setShowDeleteModal(true)} className="p-2 border border-red-200 text-red-700 rounded-xl hover:bg-red-50 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {data.description && (
        <div className="rounded-2xl border bg-card p-6 mb-6">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{data.description}</p>
        </div>
      )}

      {/* Media Section — videos and files */}
      <div className="rounded-2xl border bg-card p-6">
        <MediaSection entityType="content" entityId={params.id!} canEdit={canEdit} />
        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
          <Download className="h-3 w-3" /> Clique nos links para abrir ou fazer download dos arquivos.
        </p>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEditModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Editar Conteúdo</h2>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-sm font-medium">Título *</label>
                <input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Categoria *</label>
                <select value={editForm.category} onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={3} />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={() => updateMut.mutate({ id: params.id!, data: editForm as any })} disabled={!editForm.title.trim() || updateMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                {updateMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteModal(false)}>
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
              <p className="text-sm mb-6">Remover <strong>"{data.title}"</strong>?</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button onClick={() => deleteMut.mutate({ id: params.id! })} disabled={deleteMut.isPending} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
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
