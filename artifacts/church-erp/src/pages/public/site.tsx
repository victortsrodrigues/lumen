import { useListPublicPages } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Link } from "wouter";
import { Loader2, FileText } from "lucide-react";

const SECTION_LABELS: Record<string, string> = {
  sobre: "Sobre",
  valores: "Valores",
  horarios: "Horarios",
  contato: "Contato",
  pastoral: "Pastoral",
  historia: "Historia",
};

const SECTION_ORDER = ["sobre", "historia", "valores", "pastoral", "horarios", "contato"];

export default function PublicSitePage() {
  const { data, isLoading, isError } = useListPublicPages();

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
        <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
          <p>Nao foi possivel carregar as paginas.</p>
        </div>
      </PublicLayout>
    );
  }

  const pages = data.pages || [];

  const grouped = SECTION_ORDER
    .map((section) => ({
      section,
      label: SECTION_LABELS[section] || section,
      items: pages
        .filter((p: any) => p.section === section)
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <PublicLayout>
      <div className="space-y-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Nossa Igreja</h1>
          <p className="text-muted-foreground">
            Conheca mais sobre nossa comunidade, valores e atividades.
          </p>
        </div>

        {grouped.length === 0 && (
          <p className="text-muted-foreground text-center py-12">
            Nenhuma pagina publicada ainda.
          </p>
        )}

        {grouped.map((group) => (
          <section key={group.section}>
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">
              {group.label}
            </h2>
            <div className="grid gap-3">
              {group.items.map((page: any) => (
                <Link
                  key={page.id}
                  href={`/site/${page.slug}`}
                  className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
                >
                  {page.coverImageUrl ? (
                    <img
                      src={page.coverImageUrl}
                      alt=""
                      className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{page.title}</h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {SECTION_LABELS[page.section] || page.section}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PublicLayout>
  );
}
