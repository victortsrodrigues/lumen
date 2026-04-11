import { useGetTeachingDashboard } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect } from "wouter";
import { motion } from "framer-motion";
import {
  BookOpen, Users, BarChart3, Calendar,
  Loader2, AlertCircle, AlertTriangle
} from "lucide-react";

export default function TeachingDashboard() {
  const { user } = useAuth();
  const isMember = user?.role === "member";

  const { data, isLoading, isError } = useGetTeachingDashboard({
    query: { retry: 1, refetchOnWindowFocus: false, enabled: !isMember },
  });

  // Members go directly to "Meus Cursos"
  if (isMember) return <Redirect to="/teaching/my-courses" />;

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino" }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium animate-pulse">Carregando dados de ensino...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino" }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-destructive">
            <AlertCircle className="h-12 w-12" />
            <p className="text-lg font-medium">Erro ao carregar o dashboard de ensino.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const cards = [
    { label: "Cursos Ativos", value: data.activeCourses, icon: BookOpen, color: "text-blue-500" },
    { label: "Total de Inscritos", value: data.totalEnrollments, icon: Users, color: "text-green-500" },
    { label: "Frequência Média", value: `${data.avgAttendance}%`, icon: BarChart3, color: "text-purple-500" },
  ];

  return (
    <AppLayout breadcrumbs={[{ label: "Ensino" }]}>
      <div className="mb-8 rounded-3xl p-8 border bg-card">
        <h2 className="text-3xl font-bold mb-2">Visão Geral de Ensino</h2>
        <p className="text-muted-foreground">Acompanhe cursos, frequência e desempenho dos alunos</p>
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Upcoming Lessons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold">Próximas Aulas (7 dias)</h3>
          </div>
          {data.upcomingLessons.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma aula agendada para os próximos 7 dias.</p>
          ) : (
            <div className="space-y-3">
              {data.upcomingLessons.map((lesson: Record<string, unknown>) => (
                <div key={lesson.lessonId as string} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div>
                    <p className="font-medium text-sm">{lesson.lessonTitle as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {lesson.courseTitle as string} — {lesson.teacherName as string || "Sem professor"}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">{lesson.lessonDate as string}</p>
                    <p className="text-xs text-muted-foreground">{lesson.timeSlot as string || ""} {lesson.location ? `• ${lesson.location}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Attendance Alerts */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-semibold">Alunos com Frequência Baixa (&lt;50%)</h3>
          </div>
          {data.lowAttendanceStudents.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum aluno com frequência abaixo de 50%.</p>
          ) : (
            <div className="space-y-3">
              {data.lowAttendanceStudents.map((s: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20">
                  <div>
                    <p className="font-medium text-sm">{s.memberName as string}</p>
                    <p className="text-xs text-muted-foreground">{s.courseName as string}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-600">{s.percentage as number}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
