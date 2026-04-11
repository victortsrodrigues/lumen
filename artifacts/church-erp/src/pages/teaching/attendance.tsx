import { useState } from "react";
import {
  useListTeachingCourses, useListCourseLessons,
  useListCourseEnrollments, useGetLessonAttendance,
  useRecordLessonAttendance
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Loader2, Check, X, Save } from "lucide-react";

export default function AttendancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [attendanceMap, setAttendanceMap] = useState<Record<string, boolean>>({});

  const { data: coursesData } = useListTeachingCourses({ limit: 100, status: "em_andamento" });
  const { data: lessonsData } = useListCourseLessons(selectedCourseId, {
    query: { enabled: !!selectedCourseId },
  });
  const { data: enrollmentsData } = useListCourseEnrollments(selectedCourseId, {
    query: { enabled: !!selectedCourseId },
  });
  const { data: attendanceData } = useGetLessonAttendance(selectedLessonId, {
    query: { enabled: !!selectedLessonId },
  });

  const recordMutation = useRecordLessonAttendance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/teaching"] });
        toast({ title: "Sucesso", description: "Presença registrada com sucesso!" });
      },
      onError: () => toast({ title: "Erro", description: "Falha ao registrar presença.", variant: "destructive" }),
    },
  });

  // When lesson changes, load existing attendance
  function onLessonChange(lessonId: string) {
    setSelectedLessonId(lessonId);
    setAttendanceMap({});
  }

  // Initialize attendance map when data loads
  const enrollments = enrollmentsData?.enrollments || [];
  const existingAttendance = attendanceData?.attendance || [];

  // Build effective map: start from existing attendance, allow overrides
  function getEffectiveMap(): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    for (const e of enrollments) {
      map[e.memberId] = true; // default present
    }
    for (const a of existingAttendance as Array<{ memberId: string; present: boolean }>) {
      map[a.memberId] = a.present;
    }
    // Apply local overrides
    for (const [id, val] of Object.entries(attendanceMap)) {
      map[id] = val;
    }
    return map;
  }

  function togglePresence(memberId: string) {
    const effective = getEffectiveMap();
    setAttendanceMap(prev => ({ ...prev, [memberId]: !effective[memberId] }));
  }

  function handleSave() {
    if (!selectedLessonId) return;
    const effective = getEffectiveMap();
    const records = Object.entries(effective).map(([memberId, present]) => ({ memberId, present }));
    recordMutation.mutate({ lessonId: selectedLessonId, data: { records } });
  }

  function markAll(present: boolean) {
    const map: Record<string, boolean> = {};
    for (const e of enrollments) {
      map[e.memberId] = present;
    }
    setAttendanceMap(map);
  }

  const effective = getEffectiveMap();
  const presentCount = Object.values(effective).filter(Boolean).length;

  return (
    <AppLayout breadcrumbs={[{ label: "Ensino", href: "/teaching" }, { label: "Frequência" }]}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-purple-500" /> Registro de Frequência
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Selecione o curso e a aula para registrar presença</p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div>
          <label className="text-sm font-medium">Curso</label>
          <select
            value={selectedCourseId}
            onChange={e => { setSelectedCourseId(e.target.value); setSelectedLessonId(""); setAttendanceMap({}); }}
            className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
          >
            <option value="">Selecione um curso...</option>
            {(coursesData?.courses || []).map((c: Record<string, unknown>) => (
              <option key={c.id as string} value={c.id as string}>{c.title as string}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Aula</label>
          <select
            value={selectedLessonId}
            onChange={e => onLessonChange(e.target.value)}
            disabled={!selectedCourseId}
            className="w-full mt-1 px-3 py-2 border rounded-lg bg-background disabled:opacity-50"
          >
            <option value="">Selecione uma aula...</option>
            {(lessonsData?.lessons || []).map((l: Record<string, unknown>) => (
              <option key={l.id as string} value={l.id as string}>
                #{l.lessonOrder as number} — {l.title as string} {l.lessonDate ? `(${l.lessonDate})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Attendance List */}
      {selectedLessonId && enrollments.length > 0 && (
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Alunos Inscritos ({enrollments.length}) — Presentes: {presentCount}
            </h2>
            <div className="flex gap-2">
              <button onClick={() => markAll(true)} className="px-3 py-1 text-xs border rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600">
                <Check className="h-3 w-3 inline mr-1" /> Todos presentes
              </button>
              <button onClick={() => markAll(false)} className="px-3 py-1 text-xs border rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600">
                <X className="h-3 w-3 inline mr-1" /> Todos ausentes
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {enrollments.map((e: Record<string, unknown>) => {
              const memberId = e.memberId as string;
              const isPresent = effective[memberId] ?? true;
              return (
                <div
                  key={memberId}
                  onClick={() => togglePresence(memberId)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                    isPresent
                      ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  }`}
                >
                  <span className="font-medium text-sm">{(e.memberName as string) || "Membro"}</span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${isPresent ? "text-green-600" : "text-red-600"}`}>
                    {isPresent ? <><Check className="h-4 w-4" /> Presente</> : <><X className="h-4 w-4" /> Ausente</>}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={recordMutation.isPending}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
            >
              {recordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Presença
            </button>
          </div>
        </div>
      )}

      {selectedLessonId && enrollments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nenhum aluno inscrito neste curso.
        </div>
      )}

      {!selectedLessonId && selectedCourseId && (
        <div className="text-center py-12 text-muted-foreground">
          Selecione uma aula para registrar presença.
        </div>
      )}
    </AppLayout>
  );
}
