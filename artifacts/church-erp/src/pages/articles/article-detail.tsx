import { useState } from "react";
import {
  useGetArticleDetail, useSubmitArticle, useReviewArticle, useDeleteArticle,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth-context";
import { useParams, useLocation } from "wouter";
import {
  Loader2, Send, CheckCircle, XCircle, MessageSquare, Trash2, Edit2,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em Revisao",
  aprovado: "Aprovado",
  publicado: "Publicado",
  rejeitado: "Rejeitado",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-800",
  em_revisao: "bg-yellow-100 text-yellow-800",
  aprovado: "bg-blue-100 text-blue-800",
  publicado: "bg-green-100 text-green-800",
  rejeitado: "bg-red-100 text-red-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  artigo: "Artigo",
  devocional: "Devocional",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArticleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin";

  const [rejectNote, setRejectNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data, isLoading, isError } = useGetArticleDetail(id, {
    query: { enabled: !!id },
  });

  const isAuthor = data ? (data as any).authorId === user?.id : false;

  const submitMutation = useSubmitArticle({
    mutation: {
      onSuccess: () => toast({ title: "Sucesso", description: "Enviado para revisão." }),
      onError: (err: any) => toast({ title: "Erro", description: err?.response?.data?.message || "Falha ao enviar.", variant: "destructive" }),
    },
  });

  const reviewMutation = useReviewArticle({
    mutation: {
      onSuccess: (_data, variables: any) => {
        const wasApproval = variables?.data?.action === "approve";
        toast({
          title: wasApproval ? "Aprovado e publicado!" : "Feedback enviado",
          description: wasApproval
            ? "O artigo agora está visível para todos."
            : "O autor receberá seu feedback.",
        });
        setShowRejectForm(false);
        setRejectNote("");
      },
      onError: (err: any) => toast({ title: "Erro", description: err?.response?.data?.message || "Falha na revisão.", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteArticle({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Artigo removido." });
        setLocation("/articles");
      },
      onError: (err: any) => toast({ title: "Erro", description: err?.response?.data?.message || "Falha ao excluir.", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Artigos & Devocionais", href: "/articles" }, { label: "Carregando..." }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Artigos & Devocionais", href: "/articles" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-destructive">Artigo não encontrado.</div>
      </AppLayout>
    );
  }

  function handleSubmitForReview() {
    submitMutation.mutate({ id });
  }

  function handleApprove() {
    reviewMutation.mutate({ id, data: { action: "approve" } as any });
  }

  function handleReject() {
    if (!rejectNote.trim()) {
      toast({ title: "Erro", description: "Informe o feedback para o autor.", variant: "destructive" });
      return;
    }
    reviewMutation.mutate({ id, data: { action: "reject", note: rejectNote.trim() } as any });
  }

  const isMutating = submitMutation.isPending || reviewMutation.isPending || deleteMutation.isPending;

  // Can the current user edit this draft/rejected article?
  const canEditDraft = isAuthor && (data.status === "rascunho" || data.status === "rejeitado");
  // Author can resubmit a rejected article
  const canResubmit = isAuthor && data.status === "rejeitado";
  // Hide status badge for members viewing other people's published articles (redundant)
  const showStatusBadge = isAdmin || isAuthor || data.status !== "publicado";

  return (
    <AppLayout breadcrumbs={[{ label: "Artigos & Devocionais", href: "/articles" }, { label: data.title }]}>
      <article className="max-w-3xl mx-auto">
        {/* Admin toolbar — only delete at the top */}
        {isAdmin && (
          <div className="flex items-center justify-end gap-2 mb-4">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isMutating}
              className="p-2 rounded-xl text-destructive hover:bg-destructive/10"
              title="Excluir artigo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {data.category && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              {CATEGORY_LABELS[data.category] || data.category}
            </span>
          )}
          {showStatusBadge && (
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[data.status] || ""}`}>
              {STATUS_LABELS[data.status] || data.status}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">{data.title}</h1>

        {/* Author + dates */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-8 pb-6 border-b">
          <span>Por <strong className="text-foreground">{data.authorName || "Desconhecido"}</strong></span>
          {data.publishedAt && <span>· Publicado em {formatDate(data.publishedAt)}</span>}
          {!data.publishedAt && data.createdAt && <span>· Criado em {formatDate(data.createdAt)}</span>}
        </div>

        {/* Excerpt as lead paragraph */}
        {data.excerpt && (
          <p className="text-lg text-muted-foreground leading-relaxed mb-6 italic">
            {data.excerpt}
          </p>
        )}

        {/* Body */}
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <div className="whitespace-pre-wrap text-foreground leading-relaxed text-base">
            {data.body}
          </div>
        </div>

        {/* Feedback do revisor — visible to author or admin */}
        {data.reviewNote && (isAuthor || isAdmin) && (
          <div className={`mt-10 rounded-2xl border p-5 ${
            data.status === "rejeitado"
              ? "border-red-200 bg-red-50 dark:bg-red-900/10"
              : "border-blue-200 bg-blue-50 dark:bg-blue-900/10"
          }`}>
            <h3 className={`font-semibold flex items-center gap-2 mb-2 ${
              data.status === "rejeitado"
                ? "text-red-800 dark:text-red-400"
                : "text-blue-800 dark:text-blue-400"
            }`}>
              <MessageSquare className="h-5 w-5" />
              {data.status === "rejeitado" ? "Feedback do revisor" : "Comentário do revisor"}
            </h3>
            <p className={`text-sm whitespace-pre-wrap ${
              data.status === "rejeitado"
                ? "text-red-700 dark:text-red-300"
                : "text-blue-700 dark:text-blue-300"
            }`}>
              {data.reviewNote}
            </p>
          </div>
        )}

        {/* Author actions — inline, subtle */}
        {(canEditDraft || canResubmit || (data.status === "rascunho" && isAuthor)) && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {canEditDraft && (
              <button
                onClick={() => toast({ title: "Em breve", description: "A edição de artigos será liberada em breve." })}
                disabled={isMutating}
                className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted"
              >
                <Edit2 className="h-4 w-4" /> Editar
              </button>
            )}
            {(canResubmit || (data.status === "rascunho" && isAuthor)) && (
              <button
                onClick={handleSubmitForReview}
                disabled={isMutating}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {canResubmit ? "Reenviar para Revisão" : "Enviar para Revisão"}
              </button>
            )}
          </div>
        )}

        {/* Member waiting message */}
        {data.status === "em_revisao" && !isAdmin && isAuthor && (
          <div className="mt-6 text-sm text-muted-foreground italic text-center py-4 border-t">
            Aguardando revisão de um administrador. Você receberá feedback nesta página.
          </div>
        )}

        {/* Admin review actions — at the end of the article */}
        {data.status === "em_revisao" && isAdmin && (
          <div className="mt-10 pt-6 border-t">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Revisão</h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleApprove}
                disabled={isMutating}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl text-sm hover:bg-green-600 disabled:opacity-50"
              >
                {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Aprovar e Publicar
              </button>
              <button
                onClick={() => setShowRejectForm(!showRejectForm)}
                disabled={isMutating}
                className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted"
              >
                <XCircle className="h-4 w-4" /> Pedir revisão
              </button>
            </div>

            {/* Reject note form — appears below buttons */}
            {showRejectForm && (
              <div className="mt-4 p-5 rounded-2xl border bg-muted/30 space-y-3">
                <label className="block text-sm font-medium">Feedback para o autor *</label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm resize-y"
                  placeholder="Explique o motivo da rejeição ou as mudanças necessárias. O autor poderá ver este feedback e reenviar o artigo após editar."
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { setShowRejectForm(false); setRejectNote(""); }}
                    className="px-4 py-2 border rounded-xl text-sm hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={reviewMutation.isPending}
                    className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    {reviewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Enviar Feedback
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </article>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2">Excluir artigo</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja excluir <strong>"{data.title}"</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">
                Cancelar
              </button>
              <button
                onClick={() => { deleteMutation.mutate({ id }); setShowDeleteConfirm(false); }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
