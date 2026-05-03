import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useGetDashboardStats, useGetLeaderWidgets } from "@workspace/api-client-react";
import {
  Users, Calendar, Target, BookOpen, UsersRound,
  Loader2, MapPin, Clock, HeartHandshake, ShieldCheck, Newspaper, AlertTriangle,
  CalendarDays,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const cardClass =
  "block bg-card rounded-2xl p-6 border border-border/60 shadow-sm hover:border-primary/40 hover:shadow-md transition-all cursor-pointer";

export default function LeaderDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useGetDashboardStats();
  const { data: widgets } = useGetLeaderWidgets();

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <AppLayout breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold text-foreground">
          Olá, {user?.name?.split(" ")[0]}
        </h2>
        <p className="text-muted-foreground mt-1">
          Painel de gestão dos seus ministérios e atividades.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
          {/* KPI Cards — sem finanças */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {/* Members */}
            <motion.div variants={item}>
              <Link href="/members" className={cardClass}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Users className="w-6 h-6" />
                  </div>
                  {data.members.newThisMonth > 0 && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                      +{data.members.newThisMonth} este mês
                    </span>
                  )}
                </div>
                <p className="text-3xl font-bold">{data.members.total}</p>
                <p className="text-sm text-muted-foreground mt-1">Membros ativos</p>
                <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                  <span>Inativos: {(data.members.byStatus as any)?.inativo || 0}</span>
                  <span>Visitantes: {(data.members.byStatus as any)?.visitantes || 0}</span>
                </div>
              </Link>
            </motion.div>

            {/* Events — próximos 7 dias */}
            <motion.div variants={item}>
              <Link href="/events" className={cardClass}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
                    <Calendar className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-3xl font-bold">{data.events.upcomingCount}</p>
                <p className="text-sm text-muted-foreground mt-1">Eventos nos próximos 7 dias</p>
              </Link>
            </motion.div>

            {/* Próximo Mês */}
            <motion.div variants={item}>
              <Link href="/events" className={cardClass}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                    <CalendarDays className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-3xl font-bold">{(data.events as any).nextMonthCount ?? 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Eventos no próximo mês</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {data.events.upcomingCount} nos próximos 7 dias
                </p>
              </Link>
            </motion.div>

            {/* Teaching → Séries */}
            <motion.div variants={item}>
              <Link href="/teaching/courses?status=em_andamento" className={cardClass}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <BookOpen className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-3xl font-bold">{data.teaching.activeCourses}</p>
                <p className="text-sm text-muted-foreground mt-1">Séries em andamento</p>
                <p className="text-xs text-muted-foreground mt-2">{data.teaching.totalEnrollments} aluno(s) inscrito(s)</p>
              </Link>
            </motion.div>

            {/* Ministries */}
            <motion.div variants={item}>
              <Link href="/ministries" className={cardClass}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                    <UsersRound className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-3xl font-bold">{data.ministries.total}</p>
                <p className="text-sm text-muted-foreground mt-1">Ministérios ativos</p>
                <p className="text-xs text-muted-foreground mt-2">{data.ministries.totalMembers} membro(s) envolvido(s)</p>
              </Link>
            </motion.div>

            {/* Pequenos Grupos */}
            {(data as any).smallGroups && (
              <motion.div variants={item}>
                <Link href="/discipleship" className={cardClass}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
                      <HeartHandshake className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <p className="text-3xl font-bold">{(data as any).smallGroups.groupCount}</p>
                    <p className="text-sm text-muted-foreground">PG{(data as any).smallGroups.groupCount === 1 ? "" : "s"}</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(data as any).smallGroups.activeMemberCount} membro(s) ativo(s)
                  </p>
                  <HealthBar breakdown={(data as any).smallGroups.healthBreakdown} />
                </Link>
              </motion.div>
            )}

            {/* Planning */}
            <motion.div variants={item}>
              <Link href="/planning" className={cardClass}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                    <Target className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-3xl font-bold">{data.planning.activeInitiatives}</p>
                <p className="text-sm text-muted-foreground mt-1">Iniciativas em andamento</p>
                {data.planning.overdueInitiatives > 0 && (
                  <p className="text-xs text-red-600 font-medium mt-2">{data.planning.overdueInitiatives} atrasada(s)</p>
                )}
              </Link>
            </motion.div>
          </div>

          {/* Personal Widgets */}
          {widgets && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <motion.div variants={item}>
                <Link href="/pastoral" className={cardClass}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                      <HeartHandshake className="w-5 h-5" />
                    </div>
                    {widgets.pastoral.overdueFollowUps > 0 && (
                      <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {widgets.pastoral.overdueFollowUps} atrasado(s)
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{widgets.pastoral.pending}</p>
                  <p className="text-sm text-muted-foreground">Minhas visitas pendentes</p>
                </Link>
              </motion.div>

              <motion.div variants={item}>
                <Link href="/counseling" className={cardClass}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{widgets.counseling.openCases}</p>
                  <p className="text-sm text-muted-foreground">Casos de aconselhamento abertos</p>
                </Link>
              </motion.div>

              <motion.div variants={item}>
                <Link href="/articles" className={cardClass}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                      <Newspaper className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{widgets.articles.inReview + widgets.articles.drafts}</p>
                  <p className="text-sm text-muted-foreground">
                    Meus artigos: {widgets.articles.drafts} rascunho(s), {widgets.articles.inReview} em revisão
                  </p>
                </Link>
              </motion.div>
            </div>
          )}

          {/* Upcoming Events */}
          {data.events.upcoming && data.events.upcoming.length > 0 && (
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-violet-500" /> Próximos Eventos
              </h3>
              <div className="space-y-3">
                {data.events.upcoming.map((e: any) => (
                  <Link key={e.id} href={`/events/${e.id}`} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div>
                      <p className="font-medium text-sm">{e.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {e.startDate ? formatDateTime(e.startDate) : "—"}
                        </span>
                        {e.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {e.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                      {e.type}
                    </span>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AppLayout>
  );
}

function HealthBar({ breakdown }: { breakdown: { verde: number; amarelo: number; vermelho: number } }) {
  const total = breakdown.verde + breakdown.amarelo + breakdown.vermelho;
  if (total === 0) return null;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {breakdown.verde > 0 && <div className="bg-emerald-500" style={{ width: `${pct(breakdown.verde)}%` }} />}
        {breakdown.amarelo > 0 && <div className="bg-amber-500" style={{ width: `${pct(breakdown.amarelo)}%` }} />}
        {breakdown.vermelho > 0 && <div className="bg-red-500" style={{ width: `${pct(breakdown.vermelho)}%` }} />}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
        <span className="text-emerald-600">{breakdown.verde}</span>
        <span className="text-amber-600">{breakdown.amarelo}</span>
        <span className="text-red-600">{breakdown.vermelho}</span>
      </div>
    </div>
  );
}
