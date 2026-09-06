import { ExternalLink, FileText } from "lucide-react";

interface CloudDocumentPreviewProps {
  url: string;
  title?: string | null;
  className?: string;
}

export function isHttpsDocumentUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

export function getDocumentHref(value: string): string {
  const url = value.trim();
  if (url.startsWith("/api/storage/objects/")) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  if (url.startsWith("objects/")) return `/api/storage/${url}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function getPreviewUrl(value: string): string {
  const href = getDocumentHref(value);
  if (!/^https:\/\//i.test(href)) return href;

  try {
    const url = new URL(href);
    const driveFile = url.hostname === "drive.google.com"
      ? url.pathname.match(/^\/file\/d\/([^/]+)/)
      : null;
    if (driveFile) {
      return `https://drive.google.com/file/d/${driveFile[1]}/preview`;
    }

    const googleDocument = url.hostname === "docs.google.com"
      ? url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/)
      : null;
    if (googleDocument) {
      return `https://docs.google.com/${googleDocument[1]}/d/${googleDocument[2]}/preview`;
    }
  } catch {
    return href;
  }

  return href;
}

export function CloudDocumentPreview({ url, title, className = "" }: CloudDocumentPreviewProps) {
  const href = getDocumentHref(url);
  const previewUrl = getPreviewUrl(url);

  if (!href || !previewUrl) {
    return (
      <div className={`rounded-xl border bg-background p-4 text-sm text-destructive ${className}`}>
        O endereço deste documento não é válido.
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border bg-background ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{title || "Documento"}</span>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Abrir em nova aba <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <iframe
        src={previewUrl}
        title={title || "Visualização do documento"}
        loading="lazy"
        className="h-[28rem] w-full bg-white"
      />
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        Se o provedor não permitir a visualização incorporada, use “Abrir em nova aba”.
      </p>
    </div>
  );
}
