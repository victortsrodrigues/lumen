import { useState } from "react";
import {
  useGetCultoDetail, useUpdateCulto, useDeleteCulto, useAddCultoSong,
  useGetEventSchedule, useGetEventAttendance,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link, useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BookMarked, Edit2, Trash2, Loader2, Plus, Users, ClipboardCheck, Calendar, MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SpecialElementsCheckboxes } from "../components/SpecialElementsCheckboxes";
import { SongList } from "../components/SongList";
import { SongPicker } from "../components/SongPicker";
import { cn } from "@/lib/utils";

export default function CultoDetailPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = params.id as string;
  const canEdit = user?.role === "admin" || user?.role === "leader";

  const [activeTab, setActiveTab] = useState<"liturgia" | "escala" | "frequencia">("liturgia");
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { data, isLoading } = useGetCultoDetail(id, { query: { enabled: !!id } });

  const updateMut = useUpdateCulto();
  const deleteMut = useDeleteCulto();
  const addSongMut = useAddCultoSong();

  const culto = data as any;
  const eventId = culto?.eventId as string | undefined;

  const { data: scheduleData } = useGetEventSchedule(eventId!, {
    query: { enabled: !!eventId && activeTab === "escala" },
  });
  const { data: attendanceData } = useGetEventAttendance(eventId!, {
    query: { enabled: !!eventId && activeTab === "frequencia" && canEdit },
  });

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Cultos", href: "/cultos" }, { label: "Carregando..." }]}>
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!culto) {
    return (
      <AppLayout breadcrumbs={[{ label: "Cultos", href: "/cultos" }, { label: "Erro" }]}>
        <div className="text-center py-16 text-destructive">Culto não encontrado.</div>
      </AppLayout>
    );
  }

  function handleSpecialChange(field: "hasCommunion" | "hasBaptism" | "hasMemberReception", value: boolean) {
    if (!canEdit) return;
    updateMut.mutate({ id, data: { [field]: value } as any });
  }

  function handleDelete() {
    deleteMut.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Culto excluído" });
        setLocation("/cultos");
      },
    });
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Cultos", href: "/cultos" }, { label: culto.title }]}>
      {/* Header */}
      <div className="bg-card rounded-2xl border p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookMarked className="h-6 w-6 text-primary" /> {culto.title}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(culto.startDate), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
              {culto.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {culto.location}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted capitalize">{culto.status}</span>
              {culto.responsibleName && (
                <span>Responsável: <strong className="text-foreground">{culto.responsibleName}</strong></span>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/cultos/${id}/edit`}
                className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm hover:bg-muted"
              >
                <Edit2 className="h-4 w-4" /> Editar
              </Link>
              {user?.role === "admin" && (
                <button
                  onClick={() => setShowDelete(true)}
                  className="p-2.5 rounded-xl text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b mb-6 px-2">
        <TabButton active={activeTab === "liturgia"} onClick={() => setActiveTab("liturgia")} label="Liturgia" />
        <TabButton active={activeTab === "escala"} onClick={() => setActiveTab("escala")} label="Escala" />
        {canEdit && (
          <TabButton active={activeTab === "frequencia"} onClick={() => setActiveTab("frequencia")} label="Frequência" />
        )}
      </div>

      {/* Tab content */}
      {activeTab === "liturgia" && (
        <div className="space-y-6">
          {/* Abertura */}
          <Section title="Abertura">
            {canEdit ? (
              <textarea
                defaultValue={culto.openingText ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (culto.openingText ?? "")) {
                    updateMut.mutate({ id, data: { openingText: e.target.value || null } as any });
                  }
                }}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
                placeholder="Saudação, leitura responsiva..."
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{culto.openingText || <em className="text-muted-foreground">—</em>}</p>
            )}
          </Section>

          {/* Pregação */}
          <Section title="Pregação">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Título</label>
                  {canEdit ? (
                    <input
                      type="text"
                      defaultValue={culto.sermonTitle ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (culto.sermonTitle ?? "")) {
                          updateMut.mutate({ id, data: { sermonTitle: e.target.value || null } as any });
                        }
                      }}
                      className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                    />
                  ) : (
                    <p className="text-sm mt-1">{culto.sermonTitle || <em className="text-muted-foreground">—</em>}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Texto bíblico</label>
                  {canEdit ? (
                    <input
                      type="text"
                      defaultValue={culto.sermonReference ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (culto.sermonReference ?? "")) {
                          updateMut.mutate({ id, data: { sermonReference: e.target.value || null } as any });
                        }
                      }}
                      className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                      placeholder="Ex: Romanos 8:28-39"
                    />
                  ) : (
                    <p className="text-sm mt-1">{culto.sermonReference || <em className="text-muted-foreground">—</em>}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notas</label>
                {canEdit ? (
                  <textarea
                    defaultValue={culto.sermonNotes ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (culto.sermonNotes ?? "")) {
                        updateMut.mutate({ id, data: { sermonNotes: e.target.value || null } as any });
                      }
                    }}
                    rows={3}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                  />
                ) : (
                  <p className="text-sm mt-1 whitespace-pre-wrap">{culto.sermonNotes || <em className="text-muted-foreground">—</em>}</p>
                )}
              </div>
            </div>
          </Section>

          {/* Elementos especiais */}
          <Section title="Elementos Especiais">
            <SpecialElementsCheckboxes
              hasCommunion={!!culto.hasCommunion}
              hasBaptism={!!culto.hasBaptism}
              hasMemberReception={!!culto.hasMemberReception}
              onChange={handleSpecialChange}
              disabled={!canEdit}
            />
          </Section>

          {/* Músicas */}
          <Section
            title="Músicas"
            action={canEdit && (
              <button
                type="button"
                onClick={() => setShowSongPicker(true)}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Adicionar Música
              </button>
            )}
          >
            <SongList cultoId={id} songs={culto.songs ?? []} canEdit={canEdit} />
          </Section>
        </div>
      )}

      {activeTab === "escala" && (
        <div className="bg-card rounded-2xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Escala de Ministérios
            </h3>
            {canEdit && eventId && (
              <Link
                href={`/events/${eventId}`}
                className="text-sm text-primary hover:underline"
              >
                Gerenciar escala →
              </Link>
            )}
          </div>
          <ScheduleList items={(scheduleData as any)?.schedule ?? []} />
        </div>
      )}

      {activeTab === "frequencia" && canEdit && (
        <div className="bg-card rounded-2xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" /> Frequência
            </h3>
            {eventId && (
              <Link
                href={`/events/${eventId}`}
                className="text-sm text-primary hover:underline"
              >
                Registrar presença →
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {((attendanceData as any)?.attendance ?? []).filter((a: any) => a.present).length} membros presentes registrados.
          </p>
        </div>
      )}

      {/* Song picker */}
      {showSongPicker && (
        <SongPicker
          excludeIds={(culto.songs ?? []).map((s: any) => s.songId)}
          onPick={(songId, _songTitle) => {
            addSongMut.mutate({ id, data: { songId } as any });
          }}
          onClose={() => setShowSongPicker(false)}
        />
      )}

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDelete(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="font-bold text-lg mb-2">Excluir Culto</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Esta ação removerá o culto da agenda. Tem certeza?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDelete(false)}
                  className="px-4 py-2 border rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMut.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm disabled:opacity-50"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "pb-3 text-sm font-semibold transition-colors relative",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {active && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />}
    </button>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function ScheduleList({ items }: { items: any[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Nenhuma escala registrada.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((s: any) => (
        <li key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-background/50">
          <div>
            <p className="font-medium text-sm">{s.memberName || "—"}</p>
            <p className="text-xs text-muted-foreground">{s.serviceRoleName || "—"}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted capitalize">{s.status}</span>
        </li>
      ))}
    </ul>
  );
}
