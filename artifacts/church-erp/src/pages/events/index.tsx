import { useState, useMemo } from "react";
import {
  useGetUpcomingEvents,
  useCreateEvent, useUpdateEvent, useDeleteEvent,
  useGetEventsCalendar,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import {
  Calendar, Plus, Edit, Trash2,
  Loader2, MapPin, Clock, ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import { useFormErrorHandler, cleanFormPayload } from "@/hooks/use-form-errors";

const TYPE_LABELS: Record<string, string> = {
  culto: "Culto", reuniao: "Reunião", conferencia: "Conferência",
  social: "Social", outro: "Outro",
};

const TYPE_COLORS: Record<string, string> = {
  culto: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900",
  reuniao: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900",
  conferencia: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-900",
  social: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-900",
  outro: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-900",
};

const TYPE_DOT: Record<string, string> = {
  culto: "bg-blue-500",
  reuniao: "bg-green-500",
  conferencia: "bg-purple-500",
  social: "bg-orange-500",
  outro: "bg-gray-500",
};

const RECURRENCE_LABELS: Record<string, string> = {
  unico: "Único", semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal",
};

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? undefined : v),
  z.number().optional(),
);

const eventSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  endDate: z.string().min(1, "Data de fim é obrigatória"),
  location: z.string().optional(),
  responsibleId: z.string().optional(),
  recurrence: z.enum(["unico", "semanal", "quinzenal", "mensal"]).optional(),
  type: z.enum(["culto", "reuniao", "conferencia", "social", "outro"], {
    errorMap: () => ({ message: "Tipo é obrigatório" }),
  }),
  maxSlots: optionalNumber,
  status: z.enum(["agendado", "em_andamento", "encerrado", "cancelado"]).optional(),
});

type EventForm = z.infer<typeof eventSchema>;

// ─── Date helpers ────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay()); // Sunday
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

const MONTH_LABELS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function EventsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [, setLocation] = useLocation();

  const [viewMode, setViewMode] = useState<"month" | "week" | "upcoming">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const { data: upcomingData } = useGetUpcomingEvents();

  // Use the yearly calendar endpoint and derive weekly/monthly views client-side
  const year = String(currentDate.getFullYear());
  const { data: calendarData, isLoading: loadingCalendar } = useGetEventsCalendar({ year });

  // Flatten all events from the year
  const allEvents = useMemo(() => {
    if (!calendarData?.months) return [] as any[];
    const out: any[] = [];
    for (const m of calendarData.months as any[]) {
      for (const e of m.events || []) out.push(e);
    }
    return out;
  }, [calendarData]);

  const form = useForm<EventForm>({
    resolver: zodResolver(eventSchema),
    defaultValues: { type: "culto", recurrence: "unico", status: "agendado" },
  });
  const onInvalid = useFormErrorHandler();

  const createMutation = useCreateEvent({
    mutation: {
      onSuccess: () => { toast({ title: "Sucesso", description: "Evento criado." }); closeModal(); },
    },
  });
  const updateMutation = useUpdateEvent({
    mutation: {
      onSuccess: () => { toast({ title: "Sucesso", description: "Evento atualizado." }); closeModal(); },
    },
  });
  const deleteMutation = useDeleteEvent({
    mutation: {
      onSuccess: () => { toast({ title: "Sucesso", description: "Evento excluído." }); setDeleteTarget(null); },
    },
  });

  function closeModal() {
    setIsModalOpen(false);
    setEditingId(null);
    form.reset({ type: "culto", recurrence: "unico", status: "agendado" });
  }

  function openEdit(event: any) {
    setEditingId(event.id);
    form.reset({
      title: event.title,
      description: event.description || "",
      startDate: event.startDate?.slice(0, 16) || "",
      endDate: event.endDate?.slice(0, 16) || "",
      location: event.location || "",
      responsibleId: event.responsibleId || "",
      recurrence: event.recurrence || "unico",
      type: event.type,
      maxSlots: event.maxSlots || undefined,
      status: event.status || "agendado",
    });
    setIsModalOpen(true);
  }

  function onSubmit(values: EventForm) {
    const cleaned = cleanFormPayload(values);
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: cleaned as any });
    } else {
      createMutation.mutate({ data: cleaned as any });
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  // ─── Month view: build 6×7 grid ────────────────────────────────────────────
  const monthCells = useMemo(() => {
    const first = startOfMonth(currentDate);
    const gridStart = startOfWeek(first);
    const cells: { date: Date; inMonth: boolean; events: any[] }[] = [];
    for (let i = 0; i < 42; i++) {
      const date = addDays(gridStart, i);
      const inMonth = date.getMonth() === currentDate.getMonth();
      const events = allEvents.filter(e => e.startDate && sameDay(new Date(e.startDate), date))
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      cells.push({ date, inMonth, events });
    }
    return cells;
  }, [currentDate, allEvents]);

  // ─── Week view: 7 days ─────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const events = allEvents.filter(e => e.startDate && sameDay(new Date(e.startDate), date))
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      return { date, events };
    });
  }, [currentDate, allEvents]);

  const upcoming = upcomingData?.events || [];
  const today = new Date();

  // Header navigation
  function prev() {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, -1));
    else if (viewMode === "week") setCurrentDate(addDays(currentDate, -7));
  }
  function next() {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addDays(currentDate, 7));
  }
  function goToday() { setCurrentDate(new Date()); }

  const monthTitle = `${MONTH_LABELS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  const weekTitle = `${formatDateFull(weekDays[0]?.date.toISOString() || new Date().toISOString())} – ${formatDateFull(weekDays[6]?.date.toISOString() || new Date().toISOString())} · ${currentDate.getFullYear()}`;

  return (
    <AppLayout breadcrumbs={[{ label: "Calendário" }]}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-blue-500" /> Calendário
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Eventos e agenda da igreja</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("month")} className={`px-3 py-1.5 text-sm ${viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-card"}`}>Mês</button>
            <button onClick={() => setViewMode("week")} className={`px-3 py-1.5 text-sm ${viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-card"}`}>Semana</button>
            <button onClick={() => setViewMode("upcoming")} className={`px-3 py-1.5 text-sm ${viewMode === "upcoming" ? "bg-primary text-primary-foreground" : "bg-card"}`}>Próximos</button>
          </div>
          {canManage && (
            <button
              onClick={() => { form.reset({ type: "culto", recurrence: "unico", status: "agendado" }); setIsModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Novo Evento
            </button>
          )}
        </div>
      </div>

      {/* Navigation bar (only for month/week views) */}
      {viewMode !== "upcoming" && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={prev} className="p-2 hover:bg-secondary rounded-lg">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={next} className="p-2 hover:bg-secondary rounded-lg">
              <ChevronRight className="h-5 w-5" />
            </button>
            <button onClick={goToday} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-muted">
              Hoje
            </button>
          </div>
          <h2 className="text-lg font-semibold capitalize">
            {viewMode === "month" ? monthTitle : weekTitle}
          </h2>
          <div className="w-[160px]" />
        </div>
      )}

      {loadingCalendar && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Month view */}
      {!loadingCalendar && viewMode === "month" && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="p-2 text-center text-xs font-semibold text-muted-foreground">
                {w}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)]">
            {monthCells.map((cell, i) => {
              const isToday = sameDay(cell.date, today);
              return (
                <div
                  key={i}
                  onClick={() => { setCurrentDate(new Date(cell.date)); setViewMode("week"); }}
                  className={`border-r border-b last:border-r-0 p-1.5 overflow-hidden cursor-pointer hover:bg-muted/40 transition-colors ${
                    !cell.inMonth ? "bg-muted/20" : ""
                  }`}
                >
                  <div
                    className={`text-xs font-medium mb-1 ${
                      isToday
                        ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground"
                        : cell.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {cell.date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {cell.events.slice(0, 3).map((ev: any) => (
                      <button
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); setLocation(`/events/${ev.id}`); }}
                        className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate border ${TYPE_COLORS[ev.type] || ""}`}
                        title={`${ev.title} — ${formatTime(ev.startDate)}`}
                      >
                        <span className="font-medium">{formatTime(ev.startDate)}</span> {ev.title}
                      </button>
                    ))}
                    {cell.events.length > 3 && (
                      <p className="text-[10px] text-muted-foreground px-1">
                        +{cell.events.length - 3} mais
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {!loadingCalendar && viewMode === "week" && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map(({ date, events }, i) => {
            const isToday = sameDay(date, today);
            return (
              <div
                key={i}
                className={`rounded-2xl border p-3 min-h-[180px] ${
                  isToday ? "border-primary bg-primary/5" : "bg-card"
                }`}
              >
                <div className="text-center pb-2 mb-2 border-b">
                  <p className="text-xs text-muted-foreground uppercase">{WEEKDAY_LABELS[date.getDay()]}</p>
                  <p className={`text-xl font-bold ${isToday ? "text-primary" : ""}`}>{date.getDate()}</p>
                  <p className="text-[10px] text-muted-foreground">{MONTH_LABELS[date.getMonth()].slice(0, 3)}</p>
                </div>
                <div className="space-y-2">
                  {events.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">—</p>
                  )}
                  {events.map((ev: any) => (
                    <button
                      key={ev.id}
                      onClick={() => setLocation(`/events/${ev.id}`)}
                      className={`w-full text-left p-2 rounded-lg border ${TYPE_COLORS[ev.type] || ""} hover:opacity-80 transition-opacity`}
                    >
                      <p className="text-xs font-semibold truncate">{ev.title}</p>
                      <p className="text-[10px] flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5" /> {formatTime(ev.startDate)}
                      </p>
                      {ev.location && (
                        <p className="text-[10px] flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="h-2.5 w-2.5" /> {ev.location}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming view — list of cards */}
      {viewMode === "upcoming" && (
        <div>
          {upcoming.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground border rounded-2xl">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum evento próximo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map((ev: any) => (
                <div
                  key={ev.id}
                  onClick={() => setLocation(`/events/${ev.id}`)}
                  className="rounded-2xl border bg-card p-5 hover:shadow-md hover:border-primary/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2 h-2 rounded-full ${TYPE_DOT[ev.type] || "bg-gray-500"}`} />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[ev.type] || ""}`}>
                      {TYPE_LABELS[ev.type] || ev.type}
                    </span>
                  </div>
                  <h3 className="font-semibold mb-2 line-clamp-2">{ev.title}</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(ev.startDate).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {ev.location && (
                      <p className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3" /> {ev.location}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-end gap-2 pt-3 mt-3 border-t opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <button onClick={() => openEdit(ev)} className="p-1.5 hover:bg-muted rounded-lg" title="Editar">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget({ id: ev.id, title: ev.title })} className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive" title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <h3 className="font-semibold text-lg">Excluir evento</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja excluir <strong>"{deleteTarget.title}"</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">Cancelar</button>
              <button
                onClick={() => deleteMutation.mutate({ id: deleteTarget.id })}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">{editingId ? "Editar Evento" : "Novo Evento"}</h2>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate className="p-6 space-y-4">
              <FormErrorSummary errors={form.formState.errors} />
              <div>
                <label className="text-sm font-medium">Título *</label>
                <input {...form.register("title")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea {...form.register("description")} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Tipo *</label>
                  <select {...form.register("type")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Recorrência</label>
                  <select {...form.register("recurrence")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
                    {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Início *</label>
                  <input type="datetime-local" {...form.register("startDate")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium">Fim *</label>
                  <input type="datetime-local" {...form.register("endDate")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Local</label>
                  <input {...form.register("location")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Ex: Templo Principal" />
                </div>
                <div>
                  <label className="text-sm font-medium">Vagas</label>
                  <input type="number" inputMode="numeric" {...form.register("maxSlots", { valueAsNumber: true })} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Sem limite" />
                </div>
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
