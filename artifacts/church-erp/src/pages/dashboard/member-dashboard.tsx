import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth-context";
import { useGetMemberStats } from "@workspace/api-client-react";
import {
  Calendar, BookOpen, UsersRound, Loader2, MapPin, Clock,
  User, Award, Newspaper, MessageSquare, Music, ArrowRight,
} from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

const AREA_LABELS: Record<string, string> = {
  culto: "Culto",
  pequeno_grupo: "Pequeno grupo",
  ministerio: "Ministério",
  ebd: "Escola Bíblica",
};

const HEALTH_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  verde: { label: "Ativo", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  amarelo: { label: "Irregular", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  vermelho: { label: "Ausente", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
};

const STATUS_LABELS: Record<string, string> = {
  visitante: "Visitante",
  ativo: "Ativo",
  inativo: "Inativo",
  disciplina: "Em disciplina",
  rol_apartado: "Rol apartado",
  falecido: "Falecido",
  demitido: "Demitido",
};

export default function MemberDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useGetMemberStats();
  const firstName = data?.profile?.fullName?.trim().split(/\s+/)[0]
    || user?.name?.trim().split(/\s+/)[0];
  const enrolledCourses = data?.enrolledCourses ?? 0;
  const upcomingRegisteredEvents = data?.upcomingRegisteredEvents ?? [];
  const myMinistries = data?.myMinistries ?? [];
  const recentArticles = data?.recentArticles ?? [];

  const container: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <AppLayout breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold text-foreground">
          Olá{firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="text-muted-foreground mt-1">
          Acompanhe o dia a dia da Lumen!
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
          {/* Participation overview */}
          {data.profile && (
            <motion.section variants={item} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold">Minha participação</h3>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                    <span>
                      Membro {(STATUS_LABELS[data.profile.status ?? ""] ?? data.profile.status ?? "ativo").toLocaleLowerCase("pt-BR")}
                    </span>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="self-start">
                  <Link href="/profile">
                    Ver meu perfil
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              {(data.profile.areas?.length ?? 0) > 0 ? (
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {data.profile.areas?.map((area, index) => {
                    const health = HEALTH_STATUS[area.healthStatus ?? ""] ?? {
                      label: "Não informado",
                      dot: "bg-muted-foreground",
                      text: "text-muted-foreground",
                    };

                    return (
                      <div key={area.area ?? index} className="rounded-xl border border-border/60 bg-muted/30 p-4">
                        <p className="text-sm font-medium text-foreground">
                          {AREA_LABELS[area.area ?? ""] ?? area.area ?? "Área"}
                        </p>
                        <div className={`mt-2 flex items-center gap-2 text-sm font-semibold ${health.text}`}>
                          <span className={`h-2 w-2 rounded-full ${health.dot}`} aria-hidden="true" />
                          <span>{health.label}</span>
                        </div>
                        {area.leaderMemberName && (
                          <p className="mt-2 truncate text-xs text-muted-foreground" title={area.leaderMemberName}>
                            Referência: {area.leaderMemberName}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Ainda não há informações de participação cadastradas.
                </p>
              )}
            </motion.section>
          )}

          {/* Next Event */}
          {data.nextEvent && (
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Seu próximo evento</h3>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-lg">{data.nextEvent.title}</h4>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-2">
                    {data.nextEvent.startDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" /> {formatDateTime(data.nextEvent.startDate)}
                      </span>
                    )}
                    {data.nextEvent.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" /> {data.nextEvent.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <Link href="/teaching/my-courses">
              <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
                  <BookOpen className="w-6 h-6" />
                </div>
                <p className="text-2xl font-bold">{enrolledCourses}</p>
                <p className="text-sm text-muted-foreground">Meus cursos</p>
              </motion.div>
            </Link>

            <Link href="/events">
              <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="text-2xl font-bold">{upcomingRegisteredEvents.length}</p>
                <p className="text-sm text-muted-foreground">Eventos inscritos</p>
              </motion.div>
            </Link>

            <Link href="/ministries">
              <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
                  <UsersRound className="w-6 h-6" />
                </div>
                <p className="text-2xl font-bold">{myMinistries.length}</p>
                <p className="text-sm text-muted-foreground">Meus ministérios</p>
              </motion.div>
            </Link>

            <Link href="/lgpd/my-data">
              <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                  <User className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold mt-2">Meus Dados</p>
                <p className="text-xs text-muted-foreground">LGPD</p>
              </motion.div>
            </Link>
          </div>

          {/* My Ministries */}
          {myMinistries.length > 0 && (
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <UsersRound className="w-5 h-5 text-rose-500" /> Meus Ministérios
              </h3>
              <div className="space-y-2">
                {myMinistries.map((m) => (
                  <Link key={m.id} href={`/ministries/${m.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer">
                      <p className="font-medium text-sm">{m.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.role === "lider" ? "bg-primary/20 text-primary" : "bg-rose-100 text-rose-700"}`}>
                        {m.role === "lider" ? "Líder" : "Membro"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* Recent Articles (devocional feed) */}
          {recentArticles.length > 0 && (
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-orange-500" /> Últimos Artigos
              </h3>
              <div className="space-y-3">
                {recentArticles.map((a) => (
                  <Link key={a.id} href={`/articles/${a.id}`}>
                    <div className="p-3 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer">
                      <p className="font-medium text-sm">{a.title}</p>
                      {a.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.excerpt}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Por {a.authorName} {a.publishedAt && `· ${formatDate(a.publishedAt)}`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* Quick Actions */}
          <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/forum">
              <div className="p-4 rounded-2xl border border-border/60 hover:border-primary/40 transition-colors cursor-pointer text-center">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">Novo Tópico no Fórum</p>
              </div>
            </Link>
            <Link href="/songs">
              <div className="p-4 rounded-2xl border border-border/60 hover:border-primary/40 transition-colors cursor-pointer text-center">
                <Music className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">Sugerir Música</p>
              </div>
            </Link>
            <Link href="/teaching/my-courses">
              <div className="p-4 rounded-2xl border border-border/60 hover:border-primary/40 transition-colors cursor-pointer text-center">
                <Award className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">Meus Certificados</p>
              </div>
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AppLayout>
  );
}
