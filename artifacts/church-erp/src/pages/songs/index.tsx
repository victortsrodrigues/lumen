import { useState } from "react";
import {
  useListSongs,
  useCreateSong,
  useDeleteSong,
  useListSongSuggestions,
  useCreateSongSuggestion,
  useReviewSongSuggestion,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Music, Plus, Loader2, X, Trash2, ExternalLink, AlertTriangle, ThumbsUp,
  Clock, CheckCircle2, XCircle, Lightbulb,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  aprovada: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejeitada: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const songSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  youtubeUrl: z.string().url("Informe um link válido"),
});
type SongForm = z.infer<typeof songSchema>;

const suggestionSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  url: z.string().url("Informe um link válido do YouTube ou Spotify"),
  reason: z.string().min(5, "Justifique com ao menos 5 caracteres"),
});
type SuggestionForm = z.infer<typeof suggestionSchema>;

function domainLabel(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("youtube") || h.includes("youtu.be")) return "YouTube";
    if (h.includes("spotify")) return "Spotify";
    return h;
  } catch {
    return "Link";
  }
}

export default function SongsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "leader";
  const isMember = user?.role === "member";

  const [tab, setTab] = useState<"songs" | "suggestions">("songs");
  const [isSongModalOpen, setIsSongModalOpen] = useState(false);
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; title: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: songsData, isLoading: songsLoading } = useListSongs({ page: 1, limit: 60 });
  const { data: suggestionsData, isLoading: suggestionsLoading } = useListSongSuggestions({});

  const createSong = useCreateSong();
  const deleteSong = useDeleteSong();
  const createSuggestion = useCreateSongSuggestion();
  const reviewSuggestion = useReviewSongSuggestion();

  const songForm = useForm<SongForm>({
    resolver: zodResolver(songSchema),
    defaultValues: { title: "", youtubeUrl: "" },
  });
  const suggestForm = useForm<SuggestionForm>({
    resolver: zodResolver(suggestionSchema),
    defaultValues: { title: "", url: "", reason: "" },
  });

  const songs = (songsData?.songs || []) as any[];
  const suggestions = (suggestionsData?.suggestions || []) as any[];
  const pendingCount = suggestions.filter((s) => s.status === "pendente").length;

  function onCreateSong(values: SongForm) {
    createSong.mutate(
      { data: values as any },
      {
        onSuccess: () => {
          setIsSongModalOpen(false);
          songForm.reset({ title: "", youtubeUrl: "" });
        },
      },
    );
  }

  function onCreateSuggestion(values: SuggestionForm) {
    createSuggestion.mutate(
      { data: values as any },
      {
        onSuccess: () => {
          setIsSuggestModalOpen(false);
          suggestForm.reset({ title: "", url: "", reason: "" });
        },
      },
    );
  }

  function approveSuggestion(id: string) {
    reviewSuggestion.mutate({ id, data: { status: "aprovada" } as any });
  }

  function confirmReject() {
    if (!rejectTarget) return;
    reviewSuggestion.mutate(
      { id: rejectTarget.id, data: { status: "rejeitada", reviewNote: rejectNote || undefined } as any },
      {
        onSuccess: () => {
          setRejectTarget(null);
          setRejectNote("");
        },
      },
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Músicas" }]}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Music className="h-6 w-6 text-primary" /> Músicas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {songs.length} música(s) cadastrada(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isMember && (
            <button
              onClick={() => setIsSuggestModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90"
            >
              <Lightbulb className="h-4 w-4" /> Sugerir música
            </button>
          )}
          {canManage && (
            <button
              onClick={() => setIsSongModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Cadastrar música
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b mb-6">
        <button
          onClick={() => setTab("songs")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "songs" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Biblioteca
        </button>
        <button
          onClick={() => setTab("suggestions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            tab === "suggestions" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {isMember ? "Minhas sugestões" : "Sugestões"}
          {canManage && pendingCount > 0 && (
            <span className="bg-yellow-500 text-white text-xs rounded-full px-2 py-0.5">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Songs tab */}
      {tab === "songs" && (
        <>
          {songsLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {!songsLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {songs.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  Nenhuma música cadastrada.
                </div>
              )}
              {songs.map((song: any) => (
                <div
                  key={song.id}
                  className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow flex flex-col"
                >
                  <h3 className="font-semibold mb-3 line-clamp-2">{song.title}</h3>
                  {song.youtubeUrl ? (
                    <a
                      href={song.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-3 break-all"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      Abrir no {domainLabel(song.youtubeUrl)}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground mb-3">Sem link</p>
                  )}
                  {isAdmin && (
                    <div className="mt-auto flex justify-end pt-3 border-t">
                      <button
                        onClick={() => setDeleteTarget({ id: song.id, title: song.title })}
                        className="p-2 hover:bg-destructive/10 rounded-xl text-destructive"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Suggestions tab */}
      {tab === "suggestions" && (
        <>
          {suggestionsLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {!suggestionsLoading && (
            <div className="space-y-3">
              {suggestions.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  {isMember ? "Você ainda não sugeriu nenhuma música." : "Nenhuma sugestão no momento."}
                </div>
              )}
              {suggestions.map((s: any) => (
                <div key={s.id} className="rounded-xl border bg-card p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold">{s.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] || ""}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                  </div>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-2 break-all"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      Abrir no {domainLabel(s.url)}
                    </a>
                  )}
                  {s.reason && (
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      <span className="font-medium text-foreground">Justificativa: </span>
                      {s.reason}
                    </p>
                  )}
                  {s.status === "rejeitada" && s.reviewNote && (
                    <p className="text-sm text-destructive mt-2">
                      <span className="font-medium">Feedback: </span>
                      {s.reviewNote}
                    </p>
                  )}
                  {canManage && s.status === "pendente" && (
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                      <button
                        onClick={() => setRejectTarget({ id: s.id, title: s.title })}
                        className="flex items-center gap-2 px-3 py-1.5 border rounded-xl text-sm hover:bg-destructive/10 text-destructive"
                      >
                        <XCircle className="h-4 w-4" /> Rejeitar
                      </button>
                      <button
                        onClick={() => approveSuggestion(s.id)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Aprovar
                      </button>
                    </div>
                  )}
                  {isMember && s.status === "pendente" && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground mt-3 pt-3 border-t">
                      <Clock className="h-3 w-3" /> Aguardando análise dos administradores.
                    </p>
                  )}
                  {isMember && s.status === "aprovada" && (
                    <p className="flex items-center gap-2 text-xs text-green-600 mt-3 pt-3 border-t">
                      <ThumbsUp className="h-3 w-3" /> Sugestão aprovada e adicionada à biblioteca.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Song Modal (admin/leader) */}
      {isSongModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsSongModalOpen(false)}
        >
          <div
            className="bg-card rounded-xl border shadow-xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Cadastrar Música</h2>
              <button onClick={() => setIsSongModalOpen(false)} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={songForm.handleSubmit(onCreateSong)} className="p-6 space-y-4" noValidate>
              <div>
                <label className="text-sm font-medium">Título *</label>
                <input
                  {...songForm.register("title")}
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-background"
                />
                {songForm.formState.errors.title && (
                  <p className="text-xs text-destructive mt-1">{songForm.formState.errors.title.message}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Link *</label>
                <input
                  {...songForm.register("youtubeUrl")}
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-background"
                  placeholder="https://www.youtube.com/watch?v=... ou https://open.spotify.com/..."
                />
                {songForm.formState.errors.youtubeUrl && (
                  <p className="text-xs text-destructive mt-1">{songForm.formState.errors.youtubeUrl.message}</p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setIsSongModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createSong.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {createSong.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suggest Modal (member) */}
      {isSuggestModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsSuggestModalOpen(false)}
        >
          <div
            className="bg-card rounded-xl border shadow-xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Sugerir Música</h2>
              <button onClick={() => setIsSuggestModalOpen(false)} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={suggestForm.handleSubmit(onCreateSuggestion)} className="p-6 space-y-4" noValidate>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                Sua sugestão será analisada pelos administradores. Você será notificado quando for aprovada ou rejeitada.
              </p>
              <div>
                <label className="text-sm font-medium">Título *</label>
                <input
                  {...suggestForm.register("title")}
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-background"
                  placeholder="Nome da música"
                />
                {suggestForm.formState.errors.title && (
                  <p className="text-xs text-destructive mt-1">{suggestForm.formState.errors.title.message}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Link (YouTube ou Spotify) *</label>
                <input
                  {...suggestForm.register("url")}
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-background"
                  placeholder="https://..."
                />
                {suggestForm.formState.errors.url && (
                  <p className="text-xs text-destructive mt-1">{suggestForm.formState.errors.url.message}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Justificativa *</label>
                <textarea
                  {...suggestForm.register("reason")}
                  rows={4}
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-background"
                  placeholder="Por que você sugere esta música?"
                />
                {suggestForm.formState.errors.reason && (
                  <p className="text-xs text-destructive mt-1">{suggestForm.formState.errors.reason.message}</p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setIsSuggestModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createSuggestion.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {createSuggestion.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setRejectTarget(null); setRejectNote(""); }}
        >
          <div
            className="bg-card rounded-xl border shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-lg font-bold mb-1">Rejeitar sugestão</h2>
              <p className="text-sm text-muted-foreground mb-4">"{rejectTarget.title}"</p>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border rounded-xl bg-background"
                placeholder="Feedback (opcional) — será enviado ao autor da sugestão"
              />
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => { setRejectTarget(null); setRejectNote(""); }}
                  className="px-4 py-2 border rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmReject}
                  disabled={reviewSuggestion.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm disabled:opacity-50"
                >
                  Rejeitar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Song Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-card rounded-xl border shadow-xl w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-bold mb-2">Excluir Música</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Tem certeza que deseja excluir "{deleteTarget.title}"?
              </p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border rounded-xl text-sm">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteSong.mutate({ id: deleteTarget.id }, { onSuccess: () => setDeleteTarget(null) });
                  }}
                  disabled={deleteSong.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {deleteSong.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
