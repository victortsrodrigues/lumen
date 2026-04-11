import { useState } from "react";
import {
  useListPages,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import {
  FileText, Plus, Loader2, X, Trash2, Edit2, Eye, EyeOff,
} from "lucide-react";

const SECTION_OPTIONS = [
  { value: "sobre", label: "Sobre" },
  { value: "valores", label: "Valores" },
  { value: "horarios", label: "Horarios" },
  { value: "contato", label: "Contato" },
  { value: "pastoral", label: "Pastoral" },
  { value: "historia", label: "Historia" },
];

const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  SECTION_OPTIONS.map((s) => [s.value, s.label])
);

const EMPTY_FORM = {
  title: "",
  body: "",
  section: "sobre",
  isPublished: false,
  sortOrder: 0,
  coverImageUrl: "",
};

export default function InstitutionalPagesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data, isLoading } = useListPages();

  const createMutation = useCreatePage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
        toast({ title: "Sucesso", description: "Pagina criada." });
        closeModal();
      },
      onError: (err: any) => {
        toast({
          title: "Erro",
          description: err?.response?.data?.error || "Falha ao criar pagina.",
          variant: "destructive",
        });
      },
    },
  });

  const updateMutation = useUpdatePage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
        toast({ title: "Sucesso", description: "Pagina atualizada." });
        closeModal();
      },
      onError: (err: any) => {
        toast({
          title: "Erro",
          description: err?.response?.data?.error || "Falha ao atualizar pagina.",
          variant: "destructive",
        });
      },
    },
  });

  const deleteMutation = useDeletePage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
        toast({ title: "Sucesso", description: "Pagina removida." });
      },
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (page: any) => {
    setForm({
      title: page.title || "",
      body: page.body || "",
      section: page.section || "sobre",
      isPublished: page.isPublished ?? false,
      sortOrder: page.sortOrder ?? 0,
      coverImageUrl: page.coverImageUrl || "",
    });
    setEditingId(page.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.body.trim()) return;

    const payload: any = {
      title: form.title,
      body: form.body,
      section: form.section,
      isPublished: form.isPublished,
      sortOrder: form.sortOrder,
    };
    if (form.coverImageUrl.trim()) {
      payload.coverImageUrl = form.coverImageUrl;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Remover a pagina "${title}"?`)) return;
    deleteMutation.mutate({ id });
  };

  const handleTogglePublish = (page: any) => {
    updateMutation.mutate({
      id: page.id,
      data: { isPublished: !page.isPublished },
    });
  };

  const pages = data?.pages || [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout breadcrumbs={[{ label: "Paginas Institucionais" }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Paginas Institucionais
          </h1>
          <p className="text-muted-foreground text-sm">
            {pages.length} pagina(s) cadastrada(s)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nova Pagina
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && pages.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma pagina cadastrada.
        </div>
      )}

      {!isLoading && pages.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Titulo</th>
                <th className="text-left px-4 py-3 font-medium">Secao</th>
                <th className="text-left px-4 py-3 font-medium">Ordem</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pages.map((page: any) => (
                <tr key={page.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{page.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {SECTION_LABELS[page.section] || page.section}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {page.sortOrder ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {page.isPublished ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Publicada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Rascunho
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleTogglePublish(page)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        title={page.isPublished ? "Despublicar" : "Publicar"}
                      >
                        {page.isPublished ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => openEdit(page)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(page.id, page.title)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingId ? "Editar Pagina" : "Nova Pagina"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Titulo <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Titulo da pagina"
                  className="w-full rounded-lg border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Conteudo <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Conteudo da pagina..."
                  rows={10}
                  className="w-full rounded-lg border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Secao <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                    className="w-full rounded-lg border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {SECTION_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Ordem de exibicao
                  </label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  URL da imagem de capa
                </label>
                <input
                  type="url"
                  value={form.coverImageUrl}
                  onChange={(e) =>
                    setForm({ ...form, coverImageUrl: e.target.value })
                  }
                  placeholder="https://..."
                  className="w-full rounded-lg border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublished"
                  checked={form.isPublished}
                  onChange={(e) =>
                    setForm({ ...form, isPublished: e.target.checked })
                  }
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label htmlFor="isPublished" className="text-sm font-medium">
                  Publicar pagina
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || !form.title.trim() || !form.body.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
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
