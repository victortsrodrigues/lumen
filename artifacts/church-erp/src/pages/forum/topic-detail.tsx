import { useState } from "react";
import {
  useGetForumTopicDetail, useCreateForumReply,
  useToggleForumTopicPin, useToggleForumTopicLock, useDeleteForumTopic,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { useParams, useLocation } from "wouter";
import {
  MessageSquare, Loader2, X, Pin, Lock, Trash2, Send,
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

export default function ForumTopicDetail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const [, setLocation] = useLocation();

  const [replyBody, setReplyBody] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isAdmin = user?.role === "admin";
  const isLeader = user?.role === "leader";
  const canModerate = isAdmin || isLeader;

  const { data: topic, isLoading } = useGetForumTopicDetail(id);

  const invalidate = () => {
    queryClient.invalidateQueries({
      predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/forum"),
    });
  };

  const replyMutation = useCreateForumReply({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Resposta enviada." });
        setReplyBody("");
      },
      onError: (err: any) => {
        toast({
          title: "Erro",
          description: err?.response?.data?.message || "Falha ao enviar resposta.",
          variant: "destructive",
        });
      },
    },
  });

  const pinMutation = useToggleForumTopicPin({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: topic?.isPinned ? "Tópico desafixado." : "Tópico fixado." });
      },
      onError: () => {
        toast({ title: "Erro", description: "Falha ao alterar fixação.", variant: "destructive" });
      },
    },
  });

  const lockMutation = useToggleForumTopicLock({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: topic?.isLocked ? "Tópico destrancado." : "Tópico trancado." });
      },
      onError: () => {
        toast({ title: "Erro", description: "Falha ao alterar trancamento.", variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteForumTopic({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Tópico excluído." });
        setLocation("/forum");
      },
      onError: (err: any) => {
        toast({
          title: "Erro",
          description: err?.response?.data?.message || "Falha ao excluir tópico.",
          variant: "destructive",
        });
      },
    },
  });

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) {
      toast({ title: "Erro", description: "Escreva uma resposta.", variant: "destructive" });
      return;
    }
    replyMutation.mutate({ id, data: { body: replyBody.trim() } });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id });
    setShowDeleteModal(false);
  };

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Fórum", href: "/forum" }, { label: "Carregando..." }]}>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!topic) {
    return (
      <AppLayout breadcrumbs={[{ label: "Fórum", href: "/forum" }, { label: "Não encontrado" }]}>
        <p className="text-center py-12 text-muted-foreground">Tópico não encontrado.</p>
      </AppLayout>
    );
  }

  const replies = topic.replies || [];

  return (
    <AppLayout breadcrumbs={[{ label: "Fórum", href: "/forum" }, { label: topic.title }]}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {topic.isPinned && <Pin className="h-5 w-5 text-primary shrink-0" />}
              {topic.isLocked && <Lock className="h-5 w-5 text-muted-foreground shrink-0" />}
              <h1 className="text-2xl font-bold">{topic.title}</h1>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[topic.category] || ""}`}>
                {CATEGORY_LABELS[topic.category] || topic.category}
              </span>
              <span>por {topic.authorName}</span>
              <span>{formatDate(topic.createdAt)}</span>
            </div>
          </div>

          {/* Moderation buttons */}
          {canModerate && (
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button
                onClick={() => pinMutation.mutate({ id })}
                disabled={pinMutation.isPending}
                className={`p-2 rounded-xl text-sm hover:bg-muted border ${topic.isPinned ? "bg-primary/10 border-primary/30" : ""}`}
                title={topic.isPinned ? "Desafixar" : "Fixar"}
              >
                <Pin className="h-4 w-4" />
              </button>
              <button
                onClick={() => lockMutation.mutate({ id })}
                disabled={lockMutation.isPending}
                className={`p-2 rounded-xl text-sm hover:bg-muted border ${topic.isLocked ? "bg-orange-100 border-orange-300 dark:bg-orange-900/20" : ""}`}
                title={topic.isLocked ? "Destrancar" : "Trancar"}
              >
                <Lock className="h-4 w-4" />
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="p-2 rounded-xl text-sm hover:bg-destructive/10 border text-destructive"
                  title="Excluir tópico"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Topic Body */}
        <div className="rounded-xl border bg-card p-5 mb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <span className="font-medium text-foreground">{topic.authorName}</span>
            <span>{formatDate(topic.createdAt)}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap">{topic.body}</div>
        </div>

        {/* Replies */}
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Respostas ({replies.length})
        </h2>

        {replies.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-xl mb-6">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma resposta ainda. Seja o primeiro a responder!</p>
          </div>
        )}

        {replies.length > 0 && (
          <div className="space-y-3 mb-6">
            {replies.map((reply: any) => (
              <div key={reply.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span className="font-medium text-foreground">{reply.authorName}</span>
                  <span>{formatDate(reply.createdAt)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* Reply Form */}
        {topic.isLocked ? (
          <div className="rounded-xl border bg-muted/50 p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Lock className="h-4 w-4" /> Tópico trancado. Não é possível responder.
          </div>
        ) : (
          <form onSubmit={handleReply} className="rounded-xl border bg-card p-4">
            <label className="block text-sm font-medium mb-2">Sua Resposta</label>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={4}
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background resize-none mb-3"
              placeholder="Escreva sua resposta..."
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={replyMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {replyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Responder
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto">
          <div
            className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Excluir Tópico</h3>
              <button onClick={() => setShowDeleteModal(false)} className="p-2 hover:bg-muted rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja excluir o tópico <strong>"{topic.title}"</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Excluir"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
