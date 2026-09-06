import { useState } from "react";
import {
  useGetCouncilMeetingDetail, useDeleteCouncilMeeting,
  useAddCouncilMeetingItem, useReorderCouncilMeetingItems, useUpdateCouncilMeeting,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Gavel, Edit2, Trash2, Loader2, Plus, ListTodo,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MeetingItemRow } from "../components/MeetingItemRow";
import { AtaUploader } from "../components/AtaUploader";

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  agendada: "bg-blue-100 text-blue-700 border-blue-200",
  realizada: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelada: "bg-red-100 text-red-700 border-red-200",
};

export default function ConselhoDetailPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = params.id as string;

  const [showDelete, setShowDelete] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);

  const { data, isLoading } = useGetCouncilMeetingDetail(id, { query: { enabled: !!id } });

  const deleteMut = useDeleteCouncilMeeting();
  const addItemMut = useAddCouncilMeetingItem();
  const reorderMut = useReorderCouncilMeetingItems();
  const updateMut = useUpdateCouncilMeeting();

  if (user?.role !== "admin") return <Redirect to="/" />;

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Conselho", href: "/conselho" }, { label: "Carregando..." }]}>
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const meeting = data as any;
  if (!meeting) {
    return (
      <AppLayout breadcrumbs={[{ label: "Conselho", href: "/conselho" }, { label: "Erro" }]}>
        <div className="text-center py-16 text-destructive">Reunião não encontrada.</div>
      </AppLayout>
    );
  }

  const items: any[] = meeting.items ?? [];

  function handleDelete() {
    deleteMut.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Reunião excluída" });
        setLocation("/conselho");
      },
    });
  }

  function handleAddItem() {
    if (!newItemTitle.trim()) return;
    addItemMut.mutate(
      { id, data: { title: newItemTitle.trim() } as any },
      {
        onSuccess: () => {
          setNewItemTitle("");
          setShowAddItem(false);
        },
      },
    );
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const ids = items.map(i => i.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    reorderMut.mutate({ id, data: { itemIds: ids } as any });
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return;
    const ids = items.map(i => i.id);
    [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
    reorderMut.mutate({ id, data: { itemIds: ids } as any });
  }

  function handleAtaUploaded(mediaId: string, _title: string) {
    updateMut.mutate(
      { id, data: { ataMediaId: mediaId } as any },
      { onSuccess: () => toast({ title: "Ata vinculada" }) },
    );
  }

  function handleAtaCleared() {
    updateMut.mutate(
      { id, data: { ataMediaId: null } as any },
      { onSuccess: () => toast({ title: "Ata removida" }) },
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Conselho", href: "/conselho" }, { label: meeting.title }]}>
      {/* Header */}
      <div className="bg-card rounded-2xl border p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gavel className="h-6 w-6 text-primary" /> {meeting.title}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
              <span>{format(new Date(meeting.meetingDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[meeting.status]}`}>
                {STATUS_LABELS[meeting.status]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/conselho/${id}/edit`}
              className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm hover:bg-muted"
            >
              <Edit2 className="h-4 w-4" /> Editar
            </Link>
            <button
              onClick={() => setShowDelete(true)}
              className="p-2.5 rounded-xl text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Pauta */}
        {meeting.agenda && (
          <Section title="Pauta">
            <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/30 rounded-lg p-4">{meeting.agenda}</pre>
          </Section>
        )}

        {/* Itens da Pauta */}
        <Section
          title={`Itens da Pauta (${items.length})`}
          action={
            <button
              onClick={() => setShowAddItem(true)}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="h-4 w-4" /> Adicionar Item
            </button>
          }
        >
          {showAddItem && (
            <div className="mb-4 p-3 rounded-lg border-2 border-primary/30 bg-primary/5 flex gap-2">
              <input
                type="text"
                autoFocus
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); if (e.key === "Escape") setShowAddItem(false); }}
                placeholder="Título do novo item..."
                className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm"
              />
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!newItemTitle.trim() || addItemMut.isPending}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
              >
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => { setShowAddItem(false); setNewItemTitle(""); }}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                Cancelar
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground italic flex items-center gap-2">
              <ListTodo className="h-4 w-4" /> Nenhum item adicionado ainda.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item, idx) => (
                <MeetingItemRow
                  key={item.id}
                  meetingId={id}
                  item={item}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                  onMoveUp={() => moveUp(idx)}
                  onMoveDown={() => moveDown(idx)}
                />
              ))}
            </ul>
          )}
        </Section>

        {/* Resumo */}
        {meeting.summary && (
          <Section title="Resumo">
            <p className="text-sm whitespace-pre-wrap">{meeting.summary}</p>
          </Section>
        )}

        {/* Ata */}
        <Section title="Ata">
          <AtaUploader
            meetingId={id}
            currentMediaId={meeting.ataMediaId}
            currentTitle={meeting.ataTitle}
            currentUrl={meeting.ataUrl}
            onUploaded={handleAtaUploaded}
            onClear={handleAtaCleared}
          />
        </Section>

        {/* Observações */}
        {meeting.notes && (
          <Section title="Observações">
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{meeting.notes}</p>
          </Section>
        )}
      </div>

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDelete(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="font-bold text-lg mb-2">Excluir Reunião</h3>
              <p className="text-sm text-muted-foreground mb-4">
                A reunião e seus itens da pauta serão removidos. Esta ação pode ser revertida pelo banco mas não pela UI.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDelete(false)} className="px-4 py-2 border rounded-xl text-sm">
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
