import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useGetMemberStats } from "@workspace/api-client-react";
import {
  Calendar, BookOpen, UsersRound, Loader2, MapPin, Clock,
  User, Award, Newspaper, MessageSquare, Music,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

const PIPELINE_LABELS: Record<string, string> = {
  culto: "Culto",
  pequeno_grupo: "Pequeno Grupo",
  ministerio: "Ministério",
};

const STATUS_LABELS: Record<string, string> = {
  visitante: "Visitante",
  ativo: "Ativo",
  inativo: "Inativo",
};

export default function MemberDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useGetMemberStats();

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
          Seu caminho na igreja.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
          {/* Profile Card */}
          {data.profile && (
            <motion.div variants={item} className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-6 border border-primary/20 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center text-2xl font-bold">
                  {data.profile.fullName.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-bold text-xl">{data.profile.fullName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                      {STATUS_LABELS[data.profile.status] || data.profile.status}
                    </span>
                    {data.profile.pipelineStage && (
                      <span className="text-xs text-muted-foreground">
                        Etapa: <span className="font-medium text-foreground">{PIPELINE_LABELS[data.profile.pipelineStage] || data.profile.pipelineStage}</span>
                      </span>
                    )}
                  </div>
                  {((data.profile as any).receptionDate || data.profile.conversionDate) && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {(data.profile as any).receptionDate && (
                        <>Recepção: {formatDate((data.profile as any).receptionDate)}</>
                      )}
                      {(data.profile as any).receptionDate && data.profile.conversionDate && " · "}
                      {data.profile.conversionDate && (
                        <>Conversão: {formatDate(data.profile.conversionDate)}</>
                      )}
                    </p>
                  )}
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
                <p className="text-2xl font-bold">{data.enrolledCourses}</p>
                <p className="text-sm text-muted-foreground">Meus cursos</p>
              </motion.div>
            </Link>

            <Link href="/events">
              <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="text-2xl font-bold">{data.upcomingRegisteredEvents.length}</p>
                <p className="text-sm text-muted-foreground">Eventos inscritos</p>
              </motion.div>
            </Link>

            <Link href="/ministries">
              <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
                  <UsersRound className="w-6 h-6" />
                </div>
                <p className="text-2xl font-bold">{data.myMinistries.length}</p>
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
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" /> {formatDateTime(data.nextEvent.startDate)}
                    </span>
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

          {/* My Ministries */}
          {data.myMinistries.length > 0 && (
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <UsersRound className="w-5 h-5 text-rose-500" /> Meus Ministérios
              </h3>
              <div className="space-y-2">
                {data.myMinistries.map((m: any) => (
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
          {data.recentArticles.length > 0 && (
            <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-orange-500" /> Últimos Artigos
              </h3>
              <div className="space-y-3">
                {data.recentArticles.map((a: any) => (
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
