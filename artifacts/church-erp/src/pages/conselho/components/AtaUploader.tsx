import { useRef, useState } from "react";
import { useRequestUploadUrl, useCreateMedia } from "@workspace/api-client-react";
import { FileText, Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  meetingId?: string; // se já criada
  currentMediaId?: string | null;
  currentTitle?: string | null;
  currentUrl?: string | null;
  onUploaded: (mediaId: string, title: string) => void;
  onClear?: () => void;
}

const ACCEPTED = ".pdf,.doc,.docx";

export function AtaUploader({
  meetingId, currentMediaId, currentTitle, currentUrl, onUploaded, onClear,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const requestUrlMut = useRequestUploadUrl();
  const createMediaMut = useCreateMedia();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Request upload URL
      const requestRes: any = await requestUrlMut.mutateAsync({
        data: { name: file.name, contentType: file.type || "application/octet-stream" } as any,
      });
      const { uploadURL, objectPath } = requestRes;

      // 2. PUT file to storage
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        credentials: "include",
      });
      if (!putRes.ok) throw new Error(`Upload falhou: ${putRes.status}`);

      // 3. Create media row
      const mediaRes: any = await createMediaMut.mutateAsync({
        data: {
          url: objectPath,
          title: file.name,
          entityType: "council_meeting",
          entityId: meetingId ?? "pending", // se não criou ainda, frontend usa "pending"
        } as any,
      });

      onUploaded(mediaRes.id, mediaRes.title);
      toast({ title: "Ata anexada com sucesso" });
    } catch (err: any) {
      toast({
        title: "Erro no upload",
        description: err?.message ?? "Falha ao enviar arquivo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (currentMediaId) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-background/50">
        <FileText className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{currentTitle ?? "Ata anexada"}</p>
          {currentUrl && (
            <a
              href={currentUrl.startsWith("http") ? currentUrl : `/api/storage/objects/${currentUrl.replace(/^\//, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Baixar / abrir
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="p-2 rounded hover:bg-muted text-muted-foreground"
            title="Substituir ata"
          >
            <Upload className="h-4 w-4" />
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="p-2 rounded hover:bg-destructive/10 text-destructive"
              title="Remover anexo"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleFile}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-border bg-background/50 p-6 text-center">
      <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground mb-3">
        Anexe a ata da reunião (PDF, DOC ou DOCX)
      </p>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 mx-auto bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? "Enviando..." : "Selecionar arquivo"}
      </button>
    </div>
  );
}
