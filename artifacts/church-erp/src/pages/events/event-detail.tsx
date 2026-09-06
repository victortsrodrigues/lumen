import { useState } from "react";
import {
  useGetEventDetail, useRegisterForEvent, useUnregisterFromEvent,
  useGetEventAttendance, useRecordEventAttendance,
  useGetEventSchedule, useAddToEventSchedule, useRemoveFromEventSchedule,
  useUpdateScheduleStatus, useListServiceRoles,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { MediaSection } from "@/components/MediaSection";
import { MemberSelect } from "@/components/MemberSelect";
import {
  Calendar, MapPin, Clock, Users, UserPlus,
  Loader2, Trash2, Check, X, Save, CalendarCheck, Plus
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth-context";

const TYPE_LABELS: Record<string, string> = {
  culto: "Culto", reuniao: "Reunião", conferencia: "Conferência",
  social: "Social", outro: "Outro",
};

const RECURRENCE_LABELS: Record<string, string> = {
  unico: "Único", semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "leader";

  const [enrollMemberId, setEnrollMemberId] = useState("");
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, boolean>>({});
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleRoleId, setScheduleRoleId] = useState("");
  const [scheduleMemberId, setScheduleMemberId] = useState("");

  const { data, isLoading, isError } = useGetEventDetail(params.id!, {
    query: { enabled: !!params.id },
  });

  const { data: attendanceData } = useGetEventAttendance(params.id!, {
    query: { enabled: !!params.id && showAttendance },
  });

  const { data: scheduleData } = useGetEventSchedule(params.id!, {
    query: { enabled: !!params.id },
  });

  const { data: rolesData } = useListServiceRoles();

  const registerMutation = useRegisterForEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        toast({ title: "Sucesso", description: "Inscrição realizada." });
        setShowEnrollModal(false);
        setEnrollMemberId("");
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Falha na inscrição.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const unregisterMutation = useUnregisterFromEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        toast({ title: "Sucesso", description: "Inscrição cancelada." });
      },
    },
  });

  const recordAttendanceMutation = useRecordEventAttendance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        toast({ title: "Sucesso", description: "Presença registrada!" });
      },
    },
  });

  const addScheduleMutation = useAddToEventSchedule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        toast({ title: "Sucesso", description: "Voluntário escalado." });
        setShowScheduleModal(false);
        setScheduleRoleId("");
        setScheduleMemberId("");
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.error || "Falha.", variant: "destructive" });
      },
    },
  });

  const removeScheduleMutation = useRemoveFromEventSchedule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        toast({ title: "Sucesso", description: "Removido da escala." });
      },
    },
  });

  const updateStatusMutation = useUpdateScheduleStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/events"] });
        toast({ title: "Sucesso", description: "Status atualizado." });
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.error || "Falha.", variant: "destructive" });
      },
    },
  });

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Calendário", href: "/events" }, { label: "Carregando..." }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Calendário", href: "/events" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-destructive">Evento não encontrado.</div>
      </AppLayout>
    );
  }

  const registrations = data.registrations || [];

  function handleRegister() {
    if (!enrollMemberId.trim()) return;
    registerMutation.mutate({ id: params.id!, data: { memberId: enrollMemberId } });
  }

  function handleUnregister(memberId: string, name: string) {
    if (confirm(`Cancelar inscrição de "${name}"?`)) {
      unregisterMutation.mutate({ id: params.id!, memberId });
    }
  }

  function toggleAttendanceView() {
    if (!showAttendance) {
      // Initialize attendance map from registrations
      const map: Record<string, boolean> = {};
      for (const r of registrations) {
        map[r.memberId as string] = true;
      }
      // Override with existing attendance
      if (attendanceData?.attendance) {
        for (const a of attendanceData.attendance as Array<{ memberId: string; present: boolean }>) {
          map[a.memberId] = a.present;
        }
      }
      setAttendanceMap(map);
    }
    setShowAttendance(!showAttendance);
  }

  function togglePresence(memberId: string) {
    setAttendanceMap(prev => ({ ...prev, [memberId]: !prev[memberId] }));
  }

  function saveAttendance() {
    const records = Object.entries(attendanceMap).map(([memberId, present]) => ({ memberId, present }));
    recordAttendanceMutation.mutate({ id: params.id!, data: { records } });
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Calendário", href: "/events" }, { label: data.title }]}>
      {/* Event Info */}
      <div className="rounded-2xl border bg-card p-6 mb-8">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-blue-500" /> {data.title}
          </h1>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            {TYPE_LABELS[data.type] || data.type}
          </span>
        </div>
        {data.description && <p className="text-muted-foreground mb-4">{data.description}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> {formatDateTime(data.startDate)}</div>
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> até {formatDateTime(data.endDate)}</div>
          {data.location && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {data.location}</div>}
          {data.responsibleName && <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> {data.responsibleName}</div>}
          <div className="flex items-center gap-2">Recorrência: {data.recurrence ? RECURRENCE_LABELS[data.recurrence] || data.recurrence : "Não informada"}</div>
          <div className="flex items-center gap-2">Status: {data.status}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Registrations */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" /> Inscritos ({registrations.length})
              {data.maxSlots ? <span className="text-sm font-normal text-muted-foreground">/ {data.maxSlots} vagas</span> : null}
            </h2>
            {canManage && (
              <button onClick={() => setShowEnrollModal(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm">
                <UserPlus className="h-3 w-3" /> Inscrever
              </button>
            )}
          </div>
          {registrations.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma inscrição.</p>
          ) : (
            <div className="space-y-2">
              {registrations.map(r => (
                <div key={r.id as string} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div>
                    <p className="font-medium text-sm">{(r.memberName as string) || "Membro"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.registeredAt as string).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {canManage && (
                    <button onClick={() => handleUnregister(r.memberId as string, (r.memberName as string) || "Membro")} className="p-1 hover:bg-destructive/10 rounded text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance — admin/leader only */}
        {canManage && (
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Presença</h2>
            <button onClick={toggleAttendanceView} className="px-3 py-1 border rounded-lg text-sm">
              {showAttendance ? "Fechar" : "Registrar Presença"}
            </button>
          </div>

          {showAttendance && registrations.length > 0 && (
            <>
              <div className="space-y-2 mb-4">
                {registrations.map(r => {
                  const memberId = r.memberId as string;
                  const isPresent = attendanceMap[memberId] ?? true;
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
                      <span className="font-medium text-sm">{(r.memberName as string) || "Membro"}</span>
                      <span className={`flex items-center gap-1 text-sm font-medium ${isPresent ? "text-green-600" : "text-red-600"}`}>
                        {isPresent ? <><Check className="h-4 w-4" /> Presente</> : <><X className="h-4 w-4" /> Ausente</>}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={saveAttendance}
                disabled={recordAttendanceMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm w-full justify-center"
              >
                {recordAttendanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Presença
              </button>
            </>
          )}

          {showAttendance && registrations.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhum inscrito para registrar presença.</p>
          )}

          {!showAttendance && (
            <p className="text-muted-foreground text-sm">Clique em "Registrar Presença" para iniciar.</p>
          )}
        </div>
        )}
      </div>

      {/* Media — visible to everyone; only admin/leader can edit */}
      <div className="rounded-2xl border bg-card p-6">
        <MediaSection entityType="event" entityId={params.id!} canEdit={canManage} />
      </div>

      {/* Schedule Section */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" /> Escala de Serviço
          </h2>
          {canManage && (
            <button onClick={() => setShowScheduleModal(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm">
              <Plus className="h-3.5 w-3.5" /> Escalar
            </button>
          )}
        </div>
        {(!scheduleData?.schedule || scheduleData.schedule.length === 0) ? (
          <p className="text-muted-foreground text-sm">Nenhum voluntário escalado.</p>
        ) : (
          <div className="space-y-2">
            {scheduleData.schedule.map((s: any) => {
              const STATUS_COLORS: Record<string, string> = {
                escalado: "bg-blue-100 text-blue-800",
                confirmado: "bg-green-100 text-green-800",
                ausente: "bg-red-100 text-red-800",
                substituido: "bg-yellow-100 text-yellow-800",
              };
              const STATUS_LABELS: Record<string, string> = {
                escalado: "Escalado", confirmado: "Confirmado",
                ausente: "Ausente", substituido: "Substituído",
              };
              return (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div>
                    <p className="font-medium text-sm">{s.memberName || "Voluntário"}</p>
                    <p className="text-xs text-muted-foreground">{s.serviceRoleName || "Função"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] || ""}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                    {s.status === "escalado" && (
                      <button
                        onClick={() => updateStatusMutation.mutate({ eventId: params.id!, id: s.id, data: { status: "confirmado" } })}
                        className="p-1 text-green-600 hover:bg-green-50 rounded" title="Confirmar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => { if (confirm("Remover da escala?")) removeScheduleMutation.mutate({ eventId: params.id!, id: s.id }); }}
                        className="p-1 text-destructive hover:bg-destructive/10 rounded" title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowScheduleModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b"><h2 className="text-lg font-bold">Escalar Voluntário</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Função</label>
                <select value={scheduleRoleId} onChange={e => setScheduleRoleId(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                  <option value="">Selecione...</option>
                  {(rolesData?.roles || []).map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Membro</label>
                <div className="mt-1">
                  <MemberSelect value={scheduleMemberId} onChange={(id) => setScheduleMemberId(id)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => setShowScheduleModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button
                  onClick={() => addScheduleMutation.mutate({ eventId: params.id!, data: { serviceRoleId: scheduleRoleId, memberId: scheduleMemberId } })}
                  disabled={addScheduleMutation.isPending || !scheduleRoleId || !scheduleMemberId}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {addScheduleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Escalar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEnrollModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b"><h2 className="text-lg font-bold">Inscrever no Evento</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Membro</label>
                <div className="mt-1">
                  <MemberSelect value={enrollMemberId} onChange={(id) => setEnrollMemberId(id)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => setShowEnrollModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button onClick={handleRegister} disabled={registerMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2">
                  {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Inscrever
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
