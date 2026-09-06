import { useState } from "react";
import {
  useListForumTopics, useCreateForumTopic, useGetForumSummary, CreateForumTopicRequestCategory,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { useLocation } from "wouter";
import {
  MessageSquare, Plus, Loader2, X, Pin, Lock, Search,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  geral: "Geral",
  oracao: "Oração",
  estudo: "Estudo",
  testemunho: "Testemunho",
  duvida: "Dúvida",
};

const CATEGORY_COLORS: Record<string, string> = {
  geral: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  oracao: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  estudo: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  testemunho: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  duvida: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  } as Intl.DateTimeFormatOptions);
}

export default function ForumPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<CreateForumTopicRequestCategory>("geral");

  const { data, isLoading } = useListForumTopics({
    page,
    limit: 20,
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(searchQuery ? { search: searchQuery } : {}),
  });

  const { data: summary } = useGetForumSummary();

  const invalidate = () => {
    queryClient.invalidateQueries({
      predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/forum"),
    });
  };

  const createMutation = useCreateForumTopic({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Tópico criado." });
        closeModal();
      },
      onError: (err: any) => {
        toast({
          title: "Erro",
          description: err?.response?.data?.message || "Falha ao criar tópico.",
          variant: "destructive",
        });
      },
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setTitle("");
    setBody("");
    setCategory("geral");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast({ title: "Erro", description: "Título e corpo são obrigatórios.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ data: { title: title.trim(), body: body.trim(), category } });
  };

  const topics = data?.topics || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  // Sort pinned topics first
  const sortedTopics = [...topics].sort((a: any, b: any) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  return (
    <AppLayout breadcrumbs={[{ label: "Fórum" }]}>
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total de Tópicos</p>
            <p className="text-2xl font-bold">{summary.totalTopics}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Ativos esta Semana</p>
            <p className="text-2xl font-bold text-blue-600">{summary.activeThisWeek}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Fórum da Comunidade
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{total} tópico(s)</p>
        </div>
        {user && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Novo Tópico
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Buscar por título..."
            className="w-full pl-9 pr-3 py-2 border rounded-xl bg-background text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="border rounded-xl px-3 py-2 text-sm bg-background"
        >
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {categoryFilter && (
          <button
            onClick={() => { setCategoryFilter(""); setPage(1); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Topics List */}
      {!isLoading && sortedTopics.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum tópico encontrado.</p>
        </div>
      )}

      {!isLoading && sortedTopics.length > 0 && (
        <div className="space-y-3">
          {sortedTopics.map((topic: any) => (
            <div
              key={topic.id}
              onClick={() => setLocation(`/forum/${topic.id}`)}
              className={`rounded-xl border bg-card p-4 cursor-pointer hover:border-primary/40 transition-colors ${
                topic.pinned ? "border-primary/30 bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {topic.pinned && (
                      <Pin className="h-4 w-4 text-primary shrink-0" />
                    )}
                    {topic.locked && (
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <p className="font-semibold truncate">{topic.title}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        CATEGORY_COLORS[topic.category] || ""
                      }`}
                    >
                      {CATEGORY_LABELS[topic.category] || topic.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    <span>{topic.authorName}</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {topic.replyCount || 0} resposta(s)
                    </span>
                    {topic.lastReplyAt && (
                      <span className="text-xs">
                        Última resposta: {formatDate(topic.lastReplyAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border rounded-xl text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border rounded-xl text-sm disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto">
          <div
            className="bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Novo Tópico</h3>
              <button onClick={closeModal} className="p-2 hover:bg-muted rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                  placeholder="Título do tópico"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Categoria *</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const value = Object.values(CreateForumTopicRequestCategory).find(value => value === e.target.value);
                    if (value) setCategory(value);
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mensagem *</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  className="w-full border rounded-xl px-3 py-2 text-sm bg-background resize-none"
                  placeholder="Escreva sua mensagem..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded-xl text-sm hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Criar Tópico"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
