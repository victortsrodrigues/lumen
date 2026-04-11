import { useState } from "react";
import {
  useListArticles, useDeleteArticle,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { useLocation } from "wouter";
import {
  FileText, Plus, Filter, Trash2, Loader2, X,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em Revisão",
  aprovado: "Aprovado",
  publicado: "Publicado",
  rejeitado: "Rejeitado",
};

const CATEGORY_LABELS: Record<string, string> = {
  artigo: "Artigo",
  devocional: "Devocional",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-800",
  em_revisao: "bg-yellow-100 text-yellow-800",
  aprovado: "bg-blue-100 text-blue-800",
  publicado: "bg-green-100 text-green-800",
  rejeitado: "bg-red-100 text-red-800",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ArticlesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  // All authenticated users can create (members go through review)
  const canCreate = !!user;

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data, isLoading } = useListArticles({
    page,
    limit: 20,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(categoryFilter ? { category: categoryFilter } : {}),
  });

  const deleteMutation = useDeleteArticle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/articles") });
        toast({ title: "Sucesso", description: "Artigo excluido." });
      },
      onError: () => {
        toast({ title: "Erro", description: "Falha ao excluir artigo.", variant: "destructive" });
      },
    },
  });

  function handleDelete(id: string, title: string) {
    if (confirm(`Excluir artigo "${title}"?`)) {
      deleteMutation.mutate({ id });
    }
  }

  const articles = data?.articles || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <AppLayout breadcrumbs={[{ label: "Artigos & Devocionais" }]}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Artigos & Devocionais
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} item(ns)
            {user?.role === "member" && " — seus envios precisam ser aprovados antes de serem publicados"}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setLocation("/articles/new")}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {statusFilter && (
            <button onClick={() => { setStatusFilter(""); setPage(1); }} className="text-xs text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {categoryFilter && (
            <button onClick={() => { setCategoryFilter(""); setPage(1); }} className="text-xs text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Articles List */}
      {!isLoading && articles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum artigo encontrado.</p>
        </div>
      )}

      {!isLoading && articles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article: any) => {
            const isOwnArticle = article.authorId === user?.id;
            // Hide "publicado" status badge for members viewing other people's articles
            // (they only see published articles anyway, so showing the badge is noise)
            const showStatusBadge =
              user?.role === "admin" ||
              isOwnArticle ||
              article.status !== "publicado";
            return (
              <div
                key={article.id}
                onClick={() => setLocation(`/articles/${article.id}`)}
                className="rounded-2xl border bg-card overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-md transition-all flex flex-col group"
              >
                <div className="p-5 flex-1 flex flex-col">
                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {article.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                        {CATEGORY_LABELS[article.category] || article.category}
                      </span>
                    )}
                    {showStatusBadge && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[article.status] || ""}`}>
                        {STATUS_LABELS[article.status] || article.status}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-base leading-snug line-clamp-2 mb-2">
                    {article.title}
                  </h3>

                  {/* Excerpt */}
                  {article.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                      {article.excerpt}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="mt-auto pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">Por: {article.authorName || "Desconhecido"}</span>
                    {article.publishedAt && (
                      <span className="shrink-0 ml-2">{formatDate(article.publishedAt)}</span>
                    )}
                  </div>

                  {/* Admin delete button */}
                  {user?.role === "admin" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(article.id, article.title); }}
                      className="mt-3 flex items-center justify-center gap-2 px-3 py-1.5 border border-destructive/30 text-destructive rounded-lg text-xs hover:bg-destructive/10"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
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
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Pagina {page} de {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
