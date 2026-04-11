import { useGetPublicPage } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useParams } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PublicPageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useGetPublicPage(slug!, {
    query: { enabled: !!slug },
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  if (isError || !data) {
    return (
      <PublicLayout>
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
          <p>Pagina nao encontrada.</p>
          <Link
            href="/site"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const page = data;

  return (
    <PublicLayout>
      <div className="space-y-6">
        <Link
          href="/site"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        {page.coverImageUrl && (
          <img
            src={page.coverImageUrl}
            alt={page.title}
            className="w-full max-h-80 object-cover rounded-xl"
          />
        )}

        <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>

        <div className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap">
          {page.body}
        </div>
      </div>
    </PublicLayout>
  );
}
