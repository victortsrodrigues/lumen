import { Link } from "wouter";
import { useGetUpcomingCultos } from "@workspace/api-client-react";
import { ArrowRight, BookMarked, CalendarDays, Droplets, Loader2, MapPin, Pencil, Plus, UserRound, UserPlus, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth-context";

const timeZone = "America/Sao_Paulo";
const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" });
const monthFormat = new Intl.DateTimeFormat("pt-BR", { timeZone, month: "short" });

export function UpcomingCultoCard() {
  const { user, isAuthenticated } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "leader";
  const { data, isPending, isError, isFetching, refetch } = useGetUpcomingCultos({
    query: {
      enabled: isAuthenticated,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });
  const culto = data?.items?.[0];
  const startDate = culto ? new Date(culto.startDate) : null;

  return (
    <section aria-labelledby="upcoming-culto-heading" className="mb-8 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm sm:p-7">
      <h2 id="upcoming-culto-heading" className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <BookMarked className="h-5 w-5 text-primary" aria-hidden="true" /> Próximo culto
      </h2>

      {isPending ? (
        <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando próximo culto…
        </p>
      ) : isError ? (
        <div role="status" className="space-y-3">
          <p className="text-sm text-muted-foreground">Não foi possível carregar o próximo culto.</p>
          <Button variant="outline" className="rounded-xl" disabled={isFetching} onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : culto && startDate ? (
        <>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div aria-hidden="true" className="flex w-fit shrink-0 items-center gap-3 rounded-xl bg-primary/15 px-5 py-3 sm:min-w-24 sm:flex-col sm:gap-0 sm:py-4">
              <span className="font-display text-4xl font-bold leading-tight">{dayFormat.format(startDate)}</span>
              <span className="text-sm font-semibold uppercase">{monthFormat.format(startDate)}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <h3 className="break-words font-display text-2xl font-bold tracking-tight sm:text-3xl">{culto.title}</h3>
              <div className="flex items-start gap-2 text-sm sm:text-base">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <time dateTime={culto.startDate} className="font-medium">{dateFormat.format(startDate)} às {timeFormat.format(startDate)}</time>
                  <p className="mt-1 text-xs text-muted-foreground">Horário de Brasília</p>
                </div>
              </div>
              {culto.location && (
                <p className="flex items-start gap-2 break-words text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{culto.location}</span>
                </p>
              )}
              {culto.responsibleName && (
                <p className="flex items-start gap-2 break-words text-sm text-muted-foreground">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0">Responsável: {culto.responsibleName}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {[
                  { active: culto.hasCommunion, label: "Santa Ceia", Icon: Wine },
                  { active: culto.hasBaptism, label: "Batismo", Icon: Droplets },
                  { active: culto.hasMemberReception, label: "Recepção de membros", Icon: UserPlus },
                ].filter(item => item.active).map(({ label, Icon }) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild className="rounded-xl">
              <Link href={`/cultos/${culto.cultoId}`}>Ver programação <ArrowRight aria-hidden="true" /></Link>
            </Button>
            {canManage && (
              <Button asChild variant="outline" className="rounded-xl">
                <Link href={`/cultos/${culto.cultoId}/edit`}><Pencil aria-hidden="true" /> Editar culto</Link>
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <h3 className="font-display text-xl font-bold">Nenhum culto agendado</h3>
          <p className="text-sm text-muted-foreground">A programação dos próximos cultos aparecerá aqui.</p>
          {canManage && (
            <Button asChild className="rounded-xl">
              <Link href="/cultos/new"><Plus aria-hidden="true" /> Cadastrar culto</Link>
            </Button>
          )}
        </div>
      )}

      <Link href="/cultos" className="mt-5 inline-flex items-center gap-1.5 rounded text-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        Ver todos os cultos <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
