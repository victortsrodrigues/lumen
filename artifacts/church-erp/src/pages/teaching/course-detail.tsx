import { useState } from "react";
import {
  useGetCourseDetail, useCreateLesson, useDeleteLesson, useDeleteCourse,
  useEnrollInCourse, useUnenrollFromCourse, useGetOwnProfile,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import { useFormErrorHandler, cleanFormPayload } from "@/hooks/use-form-errors";
import {
  BookOpen, Plus, Trash2, Users, ClipboardCheck,
  Loader2, GraduationCap, MapPin, Clock, Calendar, Video, FileText, Timer, CalendarClock,
  Edit2, UserPlus, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { MediaSection } from "@/components/MediaSection";
import { MemberSelect } from "@/components/MemberSelect";

const CATEGORIES: Record<string, string> = {
  pregacao: "Pregação",
  escola_biblica: "Escola Bíblica",
  pequeno_grupo: "Pequeno Grupo",
  cursos_livres: "Cursos Livres",
};

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto", em_andamento: "Em Andamento", encerrado: "Encerrado",
};

const lessonSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  content: z.string().optional(),
  videoUrl: z.string().optional(),
  lessonDate: z.string().optional(),
  lessonOrder: z.preprocess(
    (v) => (v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? undefined : v),
    z.number().min(1, "Ordem da aula é obrigatória").optional(),
  ),
  materialPath: z.string().optional(),
});

type LessonForm = z.infer<typeof lessonSchema>;

function getYouTubeEmbed(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?/]+)/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "leader";
  const isAdmin = user?.role === "admin";
  const isMember = user?.role === "member";
  const onInvalid = useFormErrorHandler();

  const { data: ownProfile } = useGetOwnProfile({
    query: { retry: false, enabled: !!user },
  });
  const myMemberId = (ownProfile as any)?.id;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollMemberId, setEnrollMemberId] = useState("");

  const { data, isLoading, isError } = useGetCourseDetail(params.id!, {
    query: { enabled: !!params.id },
  });

  const lessonForm = useForm<LessonForm>({
    resolver: zodResolver(lessonSchema),
    defaultValues: { lessonOrder: (data?.lessons?.length || 0) + 1 },
  });

  const createLessonMutation = useCreateLesson({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Aula criada." });
        setShowLessonModal(false);
        lessonForm.reset();
      },
      onError: () => toast({ title: "Erro", description: "Falha ao criar aula.", variant: "destructive" }),
    },
  });

  const deleteLessonMutation = useDeleteLesson({
    mutation: {
      onSuccess: () => toast({ title: "Sucesso", description: "Aula removida." }),
    },
  });

  const enrollMutation = useEnrollInCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Membro inscrito." });
        setShowEnrollModal(false);
        setEnrollMemberId("");
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Falha ao inscrever.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const unenrollMutation = useUnenrollFromCourse({
    mutation: {
      onSuccess: () => toast({ title: "Sucesso", description: "Inscrição cancelada." }),
    },
  });

  const deleteCourseMutation = useDeleteCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Série excluída." });
        setLocation("/teaching/courses");
      },
      onError: () => toast({ title: "Erro", description: "Falha ao excluir série.", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino e Pregação", href: "/teaching" }, { label: "Séries", href: "/teaching/courses" }, { label: "Carregando..." }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ensino e Pregação", href: "/teaching" }, { label: "Séries", href: "/teaching/courses" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-destructive">Série não encontrada.</div>
      </AppLayout>
    );
  }

  function handleCreateLesson(values: LessonForm) {
    createLessonMutation.mutate({ courseId: params.id!, data: cleanFormPayload(values) as any });
  }

  function handleDeleteLesson(id: string, title: string) {
    if (confirm(`Remover aula "${title}"?`)) {
      deleteLessonMutation.mutate({ id });
    }
  }

  function handleEnroll() {
    if (!enrollMemberId.trim()) return;
    enrollMutation.mutate({ courseId: params.id!, data: { memberId: enrollMemberId } });
  }

  function handleUnenroll(memberId: string, name: string) {
    if (confirm(`Cancelar inscrição de "${name}"?`)) {
      unenrollMutation.mutate({ courseId: params.id!, memberId });
    }
  }

  const embedUrl = getYouTubeEmbed(data.introVideoUrl);
  const breadcrumbsPath = canManage
    ? [{ label: "Ensino e Pregação", href: "/teaching" }, { label: "Séries", href: "/teaching/courses" }, { label: data.title }]
    : [{ label: "Ensino e Pregação", href: "/teaching" }, { label: "Minhas Séries", href: "/teaching/my-courses" }, { label: data.title }];

  // Enrollment state for member self-enroll
  const enrollments = (data.enrollments || []) as any[];
  const isEnrolled = myMemberId ? enrollments.some(e => e.memberId === myMemberId) : false;
  const enrolledCount = enrollments.length;
  const hasSlots = !data.maxSlots || enrolledCount < (data.maxSlots as number);
  const isCourseOpen = data.status === "aberto";
  const canSelfEnroll = isMember && myMemberId && isCourseOpen && hasSlots && !isEnrolled;

  function handleSelfEnroll() {
    if (!myMemberId) return;
    enrollMutation.mutate({ courseId: params.id!, data: { memberId: myMemberId } });
  }

  function handleSelfUnenroll() {
    if (!myMemberId) return;
    if (confirm("Deseja cancelar sua inscrição nesta série?")) {
      unenrollMutation.mutate({ courseId: params.id!, memberId: myMemberId });
    }
  }

  function handleEditCourse() {
    setLocation(`/teaching/courses?edit=${params.id}`);
  }

  function handleDeleteCourse() {
    deleteCourseMutation.mutate({ id: params.id! });
  }

  return (
    <AppLayout breadcrumbs={breadcrumbsPath}>
      {/* Admin Actions Bar */}
      {canManage && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <button
            onClick={handleEditCourse}
            className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted"
          >
            <Edit2 className="h-4 w-4" /> Editar série
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-destructive/30 text-destructive rounded-xl text-sm hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> Excluir série
            </button>
          )}
        </div>
      )}

      {/* Course Header */}
      <div className="rounded-2xl border bg-card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-blue-500" /> {data.title}
            </h1>
            {data.description && <p className="text-muted-foreground mt-2">{data.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {CATEGORIES[data.category] || data.category}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-foreground">
              {STATUS_LABELS[data.status] || data.status}
            </span>
          </div>
        </div>

        {/* Member enroll/unenroll call-to-action */}
        {isMember && myMemberId && (
          <div className="mt-4">
            {isEnrolled ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-900/50 p-3">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Você está inscrito nesta série</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLocation(`/teaching/my-courses/${params.id}`)}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
                  >
                    Acessar conteúdo
                  </button>
                  <button
                    onClick={handleSelfUnenroll}
                    className="px-3 py-1.5 border rounded-lg text-sm hover:bg-muted"
                  >
                    Cancelar inscrição
                  </button>
                </div>
              </div>
            ) : canSelfEnroll ? (
              <button
                onClick={handleSelfEnroll}
                disabled={enrollMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {enrollMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Inscrever-se nesta série
              </button>
            ) : !isCourseOpen ? (
              <p className="text-sm text-muted-foreground italic">Esta série não está aberta para inscrições.</p>
            ) : !hasSlots ? (
              <p className="text-sm text-muted-foreground italic">Todas as vagas desta série foram preenchidas.</p>
            ) : null}
          </div>
        )}

        {/* Intro video */}
        {embedUrl && (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Video className="h-4 w-4" /> Apresentação da série
            </div>
            <div className="rounded-xl overflow-hidden aspect-video border bg-black">
              <iframe
                src={embedUrl}
                title="Apresentação da série"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        {/* Schedule & Duration */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{data.teacherName || "Sem professor"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{data.dayOfWeek || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{data.timeSlot || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{data.location || "—"}</span>
          </div>
          {(data as any).lessonDurationMinutes && (
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{(data as any).lessonDurationMinutes} min/aula</span>
            </div>
          )}
          {(data as any).totalWeeks && (
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{(data as any).totalWeeks} semana(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* Syllabus */}
      {(data as any).syllabus && (
        <div className="rounded-2xl border bg-card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" /> Ementa
          </h2>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{(data as any).syllabus}</div>
        </div>
      )}

      {/* Media — visible to everyone; only admin/leader can edit */}
      <div className="rounded-2xl border bg-card p-6 mb-8">
        <MediaSection entityType="course" entityId={params.id!} canEdit={canManage} />
      </div>

      {canManage && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Lessons */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" /> Aulas ({data.lessons?.length || 0})
              </h2>
              <button onClick={() => { lessonForm.reset({ lessonOrder: (data.lessons?.length || 0) + 1 }); setShowLessonModal(true); }} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm">
                <Plus className="h-3 w-3" /> Aula
              </button>
            </div>
            {(!data.lessons || data.lessons.length === 0) ? (
              <p className="text-muted-foreground text-sm">Nenhuma aula cadastrada.</p>
            ) : (
              <div className="space-y-2">
                {data.lessons.map((lesson) => (
                  <div key={lesson.id as string} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">
                        <span className="text-muted-foreground mr-2">#{lesson.lessonOrder as number}</span>
                        {lesson.title as string}
                      </p>
                      {lesson.lessonDate && <p className="text-xs text-muted-foreground">{lesson.lessonDate as string}</p>}
                    </div>
                    <button onClick={() => handleDeleteLesson(lesson.id as string, lesson.title as string)} className="p-1 hover:bg-destructive/10 rounded text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enrollments */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" /> Inscritos ({data.enrollments?.length || 0})
                {data.maxSlots ? <span className="text-sm font-normal text-muted-foreground">/ {data.maxSlots} vagas</span> : null}
              </h2>
              <button onClick={() => setShowEnrollModal(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm">
                <Plus className="h-3 w-3" /> Inscrever
              </button>
            </div>
            {(!data.enrollments || data.enrollments.length === 0) ? (
              <p className="text-muted-foreground text-sm">Nenhum aluno inscrito.</p>
            ) : (
              <div className="space-y-2">
                {data.enrollments.map((e) => (
                  <div key={e.id as string} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{(e.memberName as string) || "Membro"}</p>
                      <p className="text-xs text-muted-foreground">
                        Inscrito em {new Date(e.enrolledAt as string).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <button onClick={() => handleUnenroll(e.memberId as string, (e.memberName as string) || "Membro")} className="p-1 hover:bg-destructive/10 rounded text-destructive" title="Cancelar inscrição">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Lesson Modal */}
      {showLessonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLessonModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b"><h2 className="text-lg font-bold">Nova Aula</h2></div>
            <form onSubmit={lessonForm.handleSubmit(handleCreateLesson, onInvalid)} noValidate className="p-6 space-y-4">
              <FormErrorSummary errors={lessonForm.formState.errors} />
              <div>
                <label className="text-sm font-medium">Título *</label>
                <input {...lessonForm.register("title")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                {lessonForm.formState.errors.title && <p className="text-xs text-destructive mt-1">{lessonForm.formState.errors.title.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea {...lessonForm.register("description")} rows={2} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium">Conteúdo da aula</label>
                <textarea {...lessonForm.register("content")} rows={4} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Texto, resumo, anotações..." />
              </div>
              <div>
                <label className="text-sm font-medium">Vídeo da aula (URL YouTube)</label>
                <input {...lessonForm.register("videoUrl")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="https://youtube.com/..." />
              </div>
              <div>
                <label className="text-sm font-medium">Ordem *</label>
                <input type="number" inputMode="numeric" {...lessonForm.register("lessonOrder", { valueAsNumber: true })} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowLessonModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button type="submit" disabled={createLessonMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2">
                  {createLessonMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Course Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <h3 className="font-semibold text-lg">Excluir Série</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja excluir a série <strong>"{data.title}"</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">
                Cancelar
              </button>
              <button
                onClick={handleDeleteCourse}
                disabled={deleteCourseMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteCourseMutation.isPending ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEnrollModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b"><h2 className="text-lg font-bold">Inscrever Aluno</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Membro</label>
                <div className="mt-1">
                  <MemberSelect value={enrollMemberId} onChange={(id) => setEnrollMemberId(id)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => setShowEnrollModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button onClick={handleEnroll} disabled={enrollMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2">
                  {enrollMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Inscrever
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
