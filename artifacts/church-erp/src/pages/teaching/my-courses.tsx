import { useListTeachingCourses } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GraduationCap, BookOpen, Loader2, Filter, X, ArrowRight, MapPin, Clock } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const CATEGORIES: Record<string, string> = {
  ebd: "EBD", discipulado: "Discipulado", seminario: "Seminário",
  curso_livre: "Curso Livre", escola_de_lideres: "Escola de Líderes",
};

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto", em_andamento: "Em Andamento", encerrado: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  em_andamento: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  encerrado: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function CourseCard({ course }: { course: Record<string, unknown> }) {
  const [, setLocation] = useLocation();
  const status = course.status as string;
  return (
    <div
      onClick={() => setLocation(`/teaching/my-courses/${course.id}`)}
      className="rounded-2xl border bg-card p-6 cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <h3 className="font-semibold text-lg leading-tight">{course.title as string}</h3>
        <span className="shrink-0 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {CATEGORIES[(course.category as string)] || String(course.category)}
        </span>
      </div>

      {course.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.description as string}</p>
      )}

      <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
        <p className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 shrink-0" /> {(course.teacherName as string) || "Sem professor"}
        </p>
        {course.dayOfWeek && (
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            {course.dayOfWeek as string}{course.timeSlot ? ` · ${course.timeSlot}` : ""}
          </p>
        )}
        {course.location && (
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" /> {course.location as string}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status] || ""}`}>
          {STATUS_LABELS[status] || status}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </div>
  );
}

export default function MyCoursesPage() {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useListTeachingCourses({
    limit: 100,
    mine: true,
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  } as any);

  const courses = data?.courses || [];

  return (
    <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Meus Cursos" }]}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-blue-500" /> Meus Cursos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {courses.length} curso(s) {categoryFilter || statusFilter ? "filtrado(s)" : "disponíve(is)"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {(categoryFilter || statusFilter) && (
            <button
              onClick={() => { setCategoryFilter(""); setStatusFilter(""); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border rounded-2xl">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Nenhum curso encontrado com os filtros selecionados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course: Record<string, unknown>) => (
            <CourseCard key={course.id as string} course={course} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
