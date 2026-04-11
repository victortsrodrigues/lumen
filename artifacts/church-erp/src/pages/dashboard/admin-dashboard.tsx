import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useGetDashboardStats } from "@workspace/api-client-react";
import {
  Users, DollarSign, Calendar, Target, BookOpen, UsersRound,
  TrendingUp, TrendingDown, Loader2, MapPin, Clock,
} from "lucide-react";
import { motion } from "framer-motion";

function formatCurrency(value: string | number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    typeof value === "string" ? parseFloat(value) : value,
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useGetDashboardStats();

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
          Visão executiva da igreja.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {/* Members */}
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
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
                <span>Inativos: {data.members.byStatus?.inativo || 0}</span>
                <span>Visitantes: {data.members.byStatus?.visitante || 0}</span>
              </div>
            </motion.div>

            {/* Finance (admin only) */}
            {data.finance && (
              <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  {data.finance.entriesGrowth !== 0 && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${
                      data.finance.entriesGrowth > 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {data.finance.entriesGrowth > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {data.finance.entriesGrowth > 0 ? "+" : ""}{data.finance.entriesGrowth}%
                    </span>
                  )}
                </div>
                <p className="text-3xl font-bold">{formatCurrency(data.finance.currentMonth.totalEntries)}</p>
                <p className="text-sm text-muted-foreground mt-1">Arrecadação do mês</p>
                <div className="flex justify-between mt-3 text-xs text-muted-foreground">
                  <span>Despesas: {formatCurrency(data.finance.currentMonth.totalExpenses)}</span>
                  <span className={parseFloat(data.finance.currentMonth.balance) >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                    Saldo: {formatCurrency(data.finance.currentMonth.balance)}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Events */}
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold">{data.events.upcomingCount}</p>
              <p className="text-sm text-muted-foreground mt-1">Eventos nos próximos 7 dias</p>
            </motion.div>

            {/* Teaching */}
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <BookOpen className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold">{data.teaching.activeCourses}</p>
              <p className="text-sm text-muted-foreground mt-1">Cursos em andamento</p>
              <p className="text-xs text-muted-foreground mt-2">{data.teaching.totalEnrollments} aluno(s) inscrito(s)</p>
            </motion.div>

            {/* Ministries */}
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <UsersRound className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-bold">{data.ministries.total}</p>
              <p className="text-sm text-muted-foreground mt-1">Ministérios ativos</p>
              <p className="text-xs text-muted-foreground mt-2">{data.ministries.totalMembers} membro(s) envolvido(s)</p>
            </motion.div>

            {/* Planning */}
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
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
            </motion.div>
          </div>

          {/* Upcoming Events */}
          {data.events.upcoming && data.events.upcoming.length > 0 && (
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-violet-500" /> Próximos Eventos
              </h3>
              <div className="space-y-3">
                {data.events.upcoming.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
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
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AppLayout>
  );
}
