import { useState, useEffect } from "react";
import { useListTeachingCourses, useCreateCourse, useUpdateCourse, useDeleteCourse } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { MemberSelect } from "@/components/MemberSelect";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import { useFormErrorHandler, cleanFormPayload } from "@/hooks/use-form-errors";
import {
  BookOpen, Plus, Filter, Edit, Trash2, Eye,
  Loader2, X, Users
} from "lucide-react";

const CATEGORIES: Record<string, string> = {
  pregacao: "Pregação",
  escola_biblica: "Escola Bíblica",
  pequeno_grupo: "Pequeno Grupo",
  cursos_livres: "Cursos Livres",
};

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em Andamento",
  encerrado: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  em_andamento: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  encerrado: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? undefined : v),
  z.number().optional(),
);

const courseSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().min(1, "Descrição é obrigatória"),
  syllabus: z.string().min(1, "Ementa é obrigatória"),
  introVideoUrl: z.string().optional(),
  teacherId: z.string().min(1, "Professor é obrigatório"),
  category: z.enum(["pregacao", "escola_biblica", "pequeno_grupo", "cursos_livres"], {
    errorMap: () => ({ message: "Categoria é obrigatória" }),
  }),
  status: z.enum(["aberto", "em_andamento", "encerrado"], {
    errorMap: () => ({ message: "Status é obrigatório" }),
  }),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  endDate: z.string().min(1, "Data de fim é obrigatória"),
  dayOfWeek: z.string().min(1, "Dia da semana é obrigatório"),
  timeSlot: z.string().min(1, "Horário é obrigatório"),
  lessonDurationMinutes: optionalNumber,
  totalWeeks: optionalNumber,
  location: z.string().optional(),
  maxSlots: optionalNumber,
});

type CourseForm = z.infer<typeof courseSchema>;

export default function CoursesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "leader";
  const isAdmin = user?.role === "admin";
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useListTeachingCourses({
    page,
    limit: 20,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(categoryFilter ? { category: categoryFilter } : {}),
  });

  const form = useForm<CourseForm>({
    resolver: zodResolver(courseSchema),
    defaultValues: { category: "escola_biblica", status: "aberto" },
  });

  const createMutation = useCreateCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Série criada com sucesso." });
        closeModal();
      },
      onError: () => toast({ title: "Erro", description: "Falha ao criar série.", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Série atualizada com sucesso." });
        closeModal();
      },
      onError: () => toast({ title: "Erro", description: "Falha ao atualizar série.", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Série excluída com sucesso." });
      },
      onError: () => toast({ title: "Erro", description: "Falha ao excluir série.", variant: "destructive" }),
    },
  });

  function closeModal() {
    setIsModalOpen(false);
    setEditingId(null);
    form.reset({ category: "escola_biblica", status: "aberto" });
  }

  function openEdit(course: Record<string, unknown>) {
    setEditingId(course.id as string);
    form.reset({
      title: course.title as string,
      description: (course.description as string) || "",
      syllabus: (course.syllabus as string) || "",
      introVideoUrl: (course.introVideoUrl as string) || "",
      teacherId: course.teacherId as string,
      category: course.category as CourseForm["category"],
      status: (course.status as CourseForm["status"]) || "aberto",
      startDate: (course.startDate as string) || "",
      endDate: (course.endDate as string) || "",
      dayOfWeek: (course.dayOfWeek as string) || "",
      timeSlot: (course.timeSlot as string) || "",
      lessonDurationMinutes: (course.lessonDurationMinutes as number) || undefined,
      totalWeeks: (course.totalWeeks as number) || undefined,
      location: (course.location as string) || "",
      maxSlots: (course.maxSlots as number) || undefined,
    });
    setIsModalOpen(true);
  }

  const onInvalid = useFormErrorHandler();

  function onSubmit(values: CourseForm) {
    const cleaned = cleanFormPayload(values);
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: cleaned as any });
    } else {
      createMutation.mutate({ data: cleaned as any });
    }
  }

  function handleDelete(id: string, title: string) {
    if (confirm(`Deseja realmente excluir a série "${title}"?`)) {
      deleteMutation.mutate({ id });
    }
  }

  const courses = data?.courses || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const isMutating = createMutation.isPending || updateMutation.isPending;

  // Auto-open edit modal if ?edit=<id> is present in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId && courses.length > 0 && !isModalOpen) {
      const course = courses.find((c: Record<string, unknown>) => c.id === editId);
      if (course) {
        openEdit(course);
        // Clean the URL
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  return (
    <AppLayout breadcrumbs={[{ label: "Ensino e Pregação", href: "/teaching" }, { label: "Séries" }]}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-500" /> Séries
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{total} série(s) encontrada(s)</p>
        </div>
        {canManage && (
          <button
            onClick={() => { form.reset({ category: "escola_biblica", status: "aberto" }); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova Série
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {(statusFilter || categoryFilter) && (
            <button onClick={() => { setStatusFilter(""); setCategoryFilter(""); setPage(1); }} className="text-xs text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Table */}
      {!isLoading && (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="px-6 py-4">Título</th>
                <th className="px-4 py-4">Categoria</th>
                <th className="px-4 py-4">Professor</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-center">Inscritos</th>
                {canManage && <th className="px-4 py-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {courses.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhuma série encontrada.
                  </td>
                </tr>
              )}
              {courses.map((course: Record<string, unknown>) => (
                <tr
                  key={course.id as string}
                  className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                  onClick={() => setLocation(`/teaching/courses/${course.id}`)}
                >
                  <td className="px-6 py-4 font-medium">{course.title as string}</td>
                  <td className="px-4 py-4 text-sm">{CATEGORIES[(course.category as string)] || String(course.category)}</td>
                  <td className="px-4 py-4 text-sm">{(course.teacherName as string) || "—"}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[(course.status as string)] || ""}`}>
                      {STATUS_LABELS[(course.status as string)] || String(course.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Users className="h-3 w-3" /> {(course.enrolledCount as number) || 0}
                      {course.maxSlots ? `/${course.maxSlots}` : ""}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setLocation(`/teaching/courses/${course.id}`)} className="p-2 hover:bg-muted rounded-lg" title="Ver detalhes">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(course)} className="p-2 hover:bg-muted rounded-lg" title="Editar">
                          <Edit className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button onClick={() => handleDelete(course.id as string, course.title as string)} className="p-2 hover:bg-destructive/10 rounded-lg text-destructive" title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50">
              Anterior
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50">
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">{editingId ? "Editar Série" : "Nova Série"}</h2>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate className="p-6 space-y-4">
              <FormErrorSummary errors={form.formState.errors} />
              <div>
                <label className="text-sm font-medium">Título *</label>
                <input {...form.register("title")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                {form.formState.errors.title && <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Descrição *</label>
                <textarea {...form.register("description")} rows={2} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Breve descrição do curso" />
                {form.formState.errors.description && <p className="text-xs text-destructive mt-1">{form.formState.errors.description.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Ementa *</label>
                <textarea {...form.register("syllabus")} rows={5} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Conteúdo programático, objetivos, bibliografia..." />
                {form.formState.errors.syllabus && <p className="text-xs text-destructive mt-1">{form.formState.errors.syllabus.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Vídeo de Apresentação (YouTube)</label>
                <input type="url" {...form.register("introVideoUrl")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="https://youtube.com/watch?v=..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Categoria *</label>
                  <select {...form.register("category")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
                    {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Status *</label>
                  <select {...form.register("status")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Professor *</label>
                <div className="mt-1">
                  <Controller
                    name="teacherId"
                    control={form.control}
                    render={({ field }) => (
                      <MemberSelect
                        value={field.value || ""}
                        onChange={(id) => field.onChange(id)}
                        placeholder="Buscar membro para professor..."
                      />
                    )}
                  />
                </div>
                {form.formState.errors.teacherId && <p className="text-xs text-destructive mt-1">{form.formState.errors.teacherId.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Data Início *</label>
                  <input type="date" {...form.register("startDate")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium">Data Fim *</label>
                  <input type="date" {...form.register("endDate")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Dia da Semana *</label>
                  <select {...form.register("dayOfWeek")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
                    <option value="">—</option>
                    <option value="Domingo">Domingo</option>
                    <option value="Segunda">Segunda-feira</option>
                    <option value="Terça">Terça-feira</option>
                    <option value="Quarta">Quarta-feira</option>
                    <option value="Quinta">Quinta-feira</option>
                    <option value="Sexta">Sexta-feira</option>
                    <option value="Sábado">Sábado</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Horário *</label>
                  <input type="time" {...form.register("timeSlot")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Duração da aula (min)</label>
                  <input type="number" inputMode="numeric" {...form.register("lessonDurationMinutes", { valueAsNumber: true })} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Ex: 60" />
                </div>
                <div>
                  <label className="text-sm font-medium">Duração (semanas)</label>
                  <input type="number" inputMode="numeric" {...form.register("totalWeeks", { valueAsNumber: true })} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Ex: 8" />
                </div>
                <div>
                  <label className="text-sm font-medium">Vagas</label>
                  <input type="number" inputMode="numeric" {...form.register("maxSlots", { valueAsNumber: true })} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Local</label>
                <input {...form.register("location")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Ex: Sala 3" />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button type="submit" disabled={isMutating} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                  {isMutating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
