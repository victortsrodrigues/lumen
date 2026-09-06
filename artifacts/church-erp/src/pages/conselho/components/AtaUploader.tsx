import { useEffect, useState } from "react";
import { useCreateMedia } from "@workspace/api-client-react";
import { FileText, Link2, Loader2, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CloudDocumentPreview, isHttpsDocumentUrl } from "@/components/CloudDocumentPreview";

interface Props {
  meetingId?: string;
  currentMediaId?: string | null;
  currentTitle?: string | null;
  currentUrl?: string | null;
  onUploaded: (mediaId: string, title: string, url: string) => void;
  onClear?: () => void;
}

export function AtaUploader({
  meetingId, currentMediaId, currentTitle, currentUrl, onUploaded, onClear,
}: Props) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [savedUrl, setSavedUrl] = useState(currentUrl ?? "");
  const [savedTitle, setSavedTitle] = useState(currentTitle ?? "");
  const [savedMediaId, setSavedMediaId] = useState(currentMediaId ?? null);
  const [editing, setEditing] = useState(!currentMediaId);

  const createMediaMut = useCreateMedia();

  useEffect(() => {
    if (currentUrl) setSavedUrl(currentUrl);
    if (currentTitle) setSavedTitle(currentTitle);
    if (currentMediaId) setSavedMediaId(currentMediaId);
  }, [currentMediaId, currentTitle, currentUrl]);

  async function handleSave() {
    const normalizedUrl = url.trim();
    if (!isHttpsDocumentUrl(normalizedUrl)) {
      toast({
        title: "URL inválida",
        description: "Informe uma URL completa iniciada por https://.",
        variant: "destructive",
      });
      return;
    }

    try {
      const normalizedTitle = title.trim() || "Ata da reunião";
      const mediaRes: any = await createMediaMut.mutateAsync({
        data: {
          url: normalizedUrl,
          title: normalizedTitle,
          entityType: "council_meeting",
          entityId: meetingId ?? "pending",
        } as any,
      });

      setSavedMediaId(mediaRes.id);
      setSavedTitle(mediaRes.title || normalizedTitle);
      setSavedUrl(normalizedUrl);
      setUrl("");
      setTitle("");
      setEditing(false);
      onUploaded(mediaRes.id, mediaRes.title || normalizedTitle, normalizedUrl);
      toast({ title: "URL da ata salva" });
    } catch (err: any) {
      toast({
        title: "Não foi possível salvar a ata",
        description: err?.response?.data?.message || "Confira a URL e tente novamente.",
        variant: "destructive",
      });
    }
  }

  function handleClear() {
    setSavedMediaId(null);
    setSavedTitle("");
    setSavedUrl("");
    setEditing(true);
    onClear?.();
  }

  if (savedMediaId && savedUrl && !editing) {
    return (
      <div className="space-y-3">
        <CloudDocumentPreview url={savedUrl} title={savedTitle || "Ata da reunião"} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setUrl(savedUrl.startsWith("https://") ? savedUrl : "");
              setTitle(savedTitle);
              setEditing(true);
            }}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted"
          >
            <Pencil className="h-4 w-4" /> Substituir URL
          </button>
          {onClear && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <X className="h-4 w-4" /> Remover
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-background/50 p-5">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">Documento da ata</p>
          <p className="text-xs text-muted-foreground">
            Cole a URL HTTPS do PDF, DOC ou DOCX armazenado na nuvem.
          </p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">URL do documento *</label>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://drive.google.com/..."
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Título</label>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ata da reunião"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end gap-2">
        {savedMediaId && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-xl border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!url.trim() || createMediaMut.isPending}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {createMediaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Salvar URL
        </button>
      </div>
    </div>
  );
}
