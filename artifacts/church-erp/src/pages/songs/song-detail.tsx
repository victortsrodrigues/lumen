import { useGetSongDetail } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useParams, useLocation } from "wouter";
import { Music, Loader2, Edit2, ArrowLeft } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  louvor: "Louvor",
  adoracao: "Adoracao",
  hino: "Hino",
  especial: "Especial",
};

const CATEGORY_COLORS: Record<string, string> = {
  louvor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  adoracao: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  hino: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  especial: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    let videoId: string | null = null;
    if (parsed.hostname.includes("youtube.com")) {
      videoId = parsed.searchParams.get("v");
    } else if (parsed.hostname.includes("youtu.be")) {
      videoId = parsed.pathname.slice(1);
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

export default function SongDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "leader";

  const { data, isLoading, isError } = useGetSongDetail(params.id!, {
    query: { enabled: !!params.id },
  });

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Musicas", href: "/songs" }, { label: "Carregando..." }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Musicas", href: "/songs" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-destructive">Musica nao encontrada.</div>
      </AppLayout>
    );
  }

  const embedUrl = data.youtubeUrl ? getYouTubeEmbedUrl(data.youtubeUrl) : null;

  return (
    <AppLayout breadcrumbs={[{ label: "Musicas", href: "/songs" }, { label: data.title }]}>
      {/* Back + Actions */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setLocation("/songs")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para lista
        </button>
        {canEdit && (
          <button
            onClick={() => setLocation(`/songs`)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 text-sm"
          >
            <Edit2 className="h-4 w-4" /> Editar
          </button>
        )}
      </div>

      {/* Song Info */}
      <div className="rounded-xl border bg-card p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Music className="h-6 w-6 text-primary" /> {data.title}
          </h1>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              CATEGORY_COLORS[data.category] || ""
            }`}
          >
            {CATEGORY_LABELS[data.category] || data.category}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {data.author && (
            <div>
              <span className="text-muted-foreground">Autor:</span>{" "}
              <span className="font-medium">{data.author}</span>
            </div>
          )}
          {data.songKey && (
            <div>
              <span className="text-muted-foreground">Tonalidade:</span>{" "}
              <span className="font-medium font-mono">{data.songKey}</span>
            </div>
          )}
          {data.tempo && (
            <div>
              <span className="text-muted-foreground">Tempo:</span>{" "}
              <span className="font-medium">{data.tempo} BPM</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lyrics */}
        {data.lyrics && (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Letra</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">
              {data.lyrics}
            </pre>
          </div>
        )}

        {/* Chord Chart */}
        {data.chordChart && (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Cifra</h2>
            <pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground leading-relaxed">
              {data.chordChart}
            </pre>
          </div>
        )}
      </div>

      {/* YouTube Embed */}
      {embedUrl && (
        <div className="rounded-xl border bg-card p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4">Video</h2>
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={embedUrl}
              title={`${data.title} - YouTube`}
              className="absolute inset-0 w-full h-full rounded-xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <a
            href={data.youtubeUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 text-sm text-primary hover:underline"
          >
            Abrir no YouTube
          </a>
        </div>
      )}
    </AppLayout>
  );
}
