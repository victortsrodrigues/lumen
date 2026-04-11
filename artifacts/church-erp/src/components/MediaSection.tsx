import { useState } from "react";
import {
  useListMedia,
  useCreateMedia,
  useDeleteMedia,
  getListMediaQueryKey,
} from "@workspace/api-client-react";
import type { MediaLink } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Video, Link2, Plus, Trash2, ExternalLink, Loader2, X, AlertTriangle,
} from "lucide-react";

interface MediaSectionProps {
  entityType: "course_lesson" | "course" | "ministry" | "event" | "asset";
  entityId: string;
  canEdit?: boolean;
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
  } catch { /* ignore */ }
  return null;
}

function getVimeoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.replace("/", "");
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch { /* ignore */ }
  return null;
}

function getDriveEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("drive.google.com") && url.includes("/file/d/")) {
      const match = url.match(/\/file\/d\/([^/]+)/);
      return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null;
    }
  } catch { /* ignore */ }
  return null;
}

function MediaEmbed({ media }: { media: MediaLink }) {
  if (media.type === "youtube") {
    const embed = getYouTubeEmbedUrl(media.url);
    if (embed) {
      return (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe
            src={embed}
            title={media.title || "YouTube video"}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }

  if (media.type === "vimeo") {
    const embed = getVimeoEmbedUrl(media.url);
    if (embed) {
      return (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe
            src={embed}
            title={media.title || "Vimeo video"}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }

  if (media.type === "drive") {
    const embed = getDriveEmbedUrl(media.url);
    if (embed) {
      return (
        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
          <iframe
            src={embed}
            title={media.title || "Google Drive"}
            className="w-full h-full"
            allowFullScreen
          />
        </div>
      );
    }
  }

  if (media.type === "link" && (media.url.endsWith(".mp4") || media.url.endsWith(".webm"))) {
    return (
      <div className="aspect-video rounded-lg overflow-hidden bg-black">
        <video src={media.url} controls className="w-full h-full" />
      </div>
    );
  }

  // Generic link
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors"
    >
      <ExternalLink className="w-4 h-4 text-primary shrink-0" />
      <span className="text-sm font-medium truncate">
        {media.title || media.url}
      </span>
    </a>
  );
}

export function MediaSection({ entityType, entityId, canEdit = false }: MediaSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { data, isLoading } = useListMedia(
    { entityType, entityId },
    { query: { enabled: !!entityId } },
  );

  const createMutation = useCreateMedia({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMediaQueryKey({ entityType, entityId }) });
        toast({ title: "Sucesso", description: "Mídia adicionada." });
        setShowAddModal(false);
        setNewUrl("");
        setNewTitle("");
      },
      onError: (err: unknown) => {
        const msg = (err as any)?.response?.data?.error || "Falha ao adicionar mídia.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteMedia({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMediaQueryKey({ entityType, entityId }) });
        toast({ title: "Sucesso", description: "Mídia removida." });
      },
      onError: () => {
        toast({ title: "Erro", description: "Falha ao remover mídia.", variant: "destructive" });
      },
    },
  });

  const handleAdd = () => {
    if (!newUrl.trim()) return;
    const trimmed = newUrl.trim().toLowerCase();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      toast({ title: "Erro", description: "URL deve começar com http:// ou https://", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: { url: newUrl.trim(), title: newTitle.trim() || undefined, entityType, entityId },
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTargetId) return;
    deleteMutation.mutate({ id: deleteTargetId });
    setDeleteTargetId(null);
  };

  const mediaItems = data?.media || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Video className="w-5 h-5" />
          Mídias
        </h3>
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && mediaItems.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">Nenhuma mídia vinculada.</p>
      )}

      <div className="grid gap-3">
        {mediaItems.map((m) => (
          <div key={m.id} className="relative group">
            <MediaEmbed media={m} />
            {m.title && m.type !== "outro" && (
              <p className="text-sm text-muted-foreground mt-1">{m.title}</p>
            )}
            {canEdit && (
              <button
                onClick={() => setDeleteTargetId(m.id)}
                className="absolute bottom-2 right-2 p-1.5 rounded-full bg-destructive/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remover mídia"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-md border border-border">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                Adicionar Mídia
              </h4>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">URL *</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Título (opcional)</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Descrição do recurso"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-input hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdd}
                disabled={createMutation.isPending || !newUrl.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Media Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTargetId(null)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Remover Mídia</h2>
                  <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <p className="text-sm mb-6">Tem certeza que deseja remover esta mídia?</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTargetId(null)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button
                  onClick={handleConfirmDelete}
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
    </div>
  );
}
