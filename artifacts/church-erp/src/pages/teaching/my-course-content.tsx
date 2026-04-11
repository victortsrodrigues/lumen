import { useState } from "react";
import {
  useGetCourseDetail, useListLessonDiscussions, useCreateLessonDiscussion, useDeleteLessonDiscussion,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  BookOpen, Loader2, Video, FileText, MessageCircle, Send, Trash2, ChevronDown, ChevronUp,
  Play, Download, Reply, Clock,
} from "lucide-react";

function getYouTubeEmbed(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?/]+)/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD}d`;
  return d.toLocaleDateString("pt-BR");
}

// ─── Discussion Thread Component ─────────────────────────────────────────────

function DiscussionThread({ lessonId }: { lessonId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const { data, isLoading } = useListLessonDiscussions(lessonId);
  const discussions = data?.discussions || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => {
      const key = q.queryKey[0] as string;
      return key?.includes(`/teaching/lessons/${lessonId}/discussions`);
    }});
  };

  const createMut = useCreateLessonDiscussion({
    mutation: {
      onSuccess: () => { invalidate(); setNewComment(""); setReplyBody(""); setReplyTo(null); },
      onError: (err: any) => toast({ title: "Erro", description: err?.response?.data?.message || "Falha.", variant: "destructive" }),
    },
  });

  const deleteMut = useDeleteLessonDiscussion({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Comentário removido" }); },
      onError: (err: any) => toast({ title: "Erro", description: err?.response?.data?.message || "Falha.", variant: "destructive" }),
    },
  });

  const topLevel = discussions.filter((d: any) => !d.parentId);
  const repliesByParent: Record<string, any[]> = {};
  discussions.filter((d: any) => d.parentId).forEach((d: any) => {
    (repliesByParent[d.parentId] ||= []).push(d);
  });

  const handleSendTopLevel = () => {
    if (!newComment.trim()) return;
    createMut.mutate({ lessonId, data: { body: newComment.trim() } });
  };

  const handleSendReply = (parentId: string) => {
    if (!replyBody.trim()) return;
    createMut.mutate({ lessonId, data: { body: replyBody.trim(), parentId } });
  };

  const handleDelete = (id: string) => {
    if (confirm("Remover este comentário?")) deleteMut.mutate({ id });
  };

  return (
    <div className="mt-4 pt-4 border-t space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4" /> Dúvidas e discussões ({topLevel.length})
      </h4>

      {/* New comment input */}
      <div className="flex gap-2">
        <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
          {user?.name?.charAt(0) || "U"}
        </div>
        <div className="flex-1">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Escreva uma dúvida ou comentário..."
            rows={2}
            className="w-full border rounded-xl px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {newComment.trim() && (
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSendTopLevel}
                disabled={createMut.isPending}
                className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Publicar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Discussions list */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && topLevel.length === 0 && (
        <p className="text-center py-6 text-sm text-muted-foreground">
          Nenhuma dúvida ainda. Seja o primeiro a perguntar!
        </p>
      )}

      <div className="space-y-4">
        {topLevel.map((d: any) => {
          const replies = repliesByParent[d.id] || [];
          const isOwnComment = d.authorId === user?.id;
          return (
            <div key={d.id} className="space-y-2">
              <div className="flex gap-2">
                <div className="w-9 h-9 shrink-0 rounded-full bg-muted text-foreground flex items-center justify-center font-bold text-sm">
                  {d.authorName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl bg-muted/60 px-4 py-2.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold">{d.authorName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatTime(d.createdAt)}
                      </p>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{d.body}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-4 text-xs text-muted-foreground">
                    <button
                      onClick={() => { setReplyTo(replyTo === d.id ? null : d.id); setReplyBody(""); }}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <Reply className="h-3 w-3" /> Responder
                    </button>
                    {isOwnComment && (
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="flex items-center gap-1 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                    )}
                  </div>

                  {/* Reply input */}
                  {replyTo === d.id && (
                    <div className="flex gap-2 mt-2 ml-4">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Escreva uma resposta..."
                        rows={2}
                        autoFocus
                        className="flex-1 border rounded-xl px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        onClick={() => handleSendReply(d.id)}
                        disabled={!replyBody.trim() || createMut.isPending}
                        className="self-end px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Replies */}
                  {replies.length > 0 && (
                    <div className="mt-2 ml-4 space-y-2 pl-3 border-l-2 border-muted">
                      {replies.map((r: any) => {
                        const isOwnReply = r.authorId === user?.id;
                        return (
                          <div key={r.id} className="flex gap-2">
                            <div className="w-7 h-7 shrink-0 rounded-full bg-muted text-foreground flex items-center justify-center font-bold text-xs">
                              {r.authorName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="rounded-2xl bg-muted/40 px-3 py-2">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="text-xs font-semibold">{r.authorName}</p>
                                  <p className="text-[10px] text-muted-foreground">{formatTime(r.createdAt)}</p>
                                </div>
                                <p className="text-xs whitespace-pre-wrap">{r.body}</p>
                              </div>
                              {isOwnReply && (
                                <button
                                  onClick={() => handleDelete(r.id)}
                                  className="ml-3 mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-2.5 w-2.5" /> Excluir
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lesson Card (collapsible) ───────────────────────────────────────────────

function LessonCard({ lesson, defaultOpen }: { lesson: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false);
  const videoEmbed = getYouTubeEmbed(lesson.videoUrl);

  return (
    <div className="rounded-2xl border bg-card overflow-hidden transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
          {lesson.lessonOrder}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base">{lesson.title}</h3>
          {lesson.description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{lesson.description}</p>
          )}
          {lesson.lessonDate && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {new Date(lesson.lessonDate + "T12:00:00").toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
          {lesson.videoUrl && <Video className="h-4 w-4" />}
          {lesson.materialPath && <FileText className="h-4 w-4" />}
          {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>

      {open && (
        <div className="border-t p-5 space-y-4">
          {/* Video */}
          {videoEmbed && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Play className="h-4 w-4" /> Vídeo da aula
              </h4>
              <div className="rounded-xl overflow-hidden aspect-video border bg-black">
                <iframe
                  src={videoEmbed}
                  title={lesson.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            </div>
          )}

          {/* Content */}
          {lesson.content && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Conteúdo
              </h4>
              <div className="text-sm whitespace-pre-wrap leading-relaxed rounded-xl bg-muted/30 p-4">{lesson.content}</div>
            </div>
          )}

          {/* Material download */}
          {lesson.materialPath && (
            <div>
              <a
                href={`/api/storage${lesson.materialPath}`}
                download
                className="inline-flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted"
              >
                <Download className="h-4 w-4" /> Baixar material da aula
              </a>
            </div>
          )}

          {!videoEmbed && !lesson.content && !lesson.materialPath && (
            <p className="text-sm text-muted-foreground italic">O professor ainda não adicionou conteúdo para esta aula.</p>
          )}

          {/* Discussions */}
          <DiscussionThread lessonId={lesson.id} />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MyCourseContentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const { data, isLoading, isError } = useGetCourseDetail(id);

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Meus Cursos", href: "/teaching/my-courses" }, { label: "Carregando..." }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Meus Cursos", href: "/teaching/my-courses" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-destructive">Curso não encontrado.</div>
      </AppLayout>
    );
  }

  const lessons = (data.lessons || []).slice().sort((a: any, b: any) => a.lessonOrder - b.lessonOrder);

  return (
    <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Meus Cursos", href: "/teaching/my-courses" }, { label: data.title }]}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-primary/10 p-6 mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">{data.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {data.teacherName || "Sem professor"} · {lessons.length} aula(s)
              </p>
            </div>
          </div>
          {data.description && <p className="text-sm text-foreground/80">{data.description}</p>}
        </div>

        {/* Lessons */}
        <h2 className="text-lg font-semibold mb-4">Aulas do curso</h2>
        {lessons.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border rounded-2xl">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma aula publicada ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lessons.map((lesson: any, i: number) => (
              <LessonCard key={lesson.id} lesson={lesson} defaultOpen={i === 0} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
