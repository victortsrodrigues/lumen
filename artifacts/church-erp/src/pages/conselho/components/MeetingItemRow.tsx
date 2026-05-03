import { useState } from "react";
import {
  useUpdateCouncilMeetingItem, useDeleteCouncilMeetingItem,
} from "@workspace/api-client-react";
import { ChevronUp, ChevronDown, Trash2, Edit2, X, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Item {
  id: string;
  meetingId: string;
  order: number;
  title: string;
  description: string | null;
  status: "pendente" | "discutida" | "decidida";
  resolution: string | null;
  resolvedAt: string | null;
}

interface Props {
  meetingId: string;
  item: Item;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  discutida: "Discutida",
  decidida: "Decidida",
};
const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-slate-100 text-slate-700 border-slate-200",
  discutida: "bg-amber-100 text-amber-700 border-amber-200",
  decidida: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export function MeetingItemRow({ meetingId, item, isFirst, isLast, onMoveUp, onMoveDown }: Props) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [showResolve, setShowResolve] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"pendente" | "discutida" | "decidida" | null>(null);
  const [resolution, setResolution] = useState(item.resolution ?? "");

  const updateMut = useUpdateCouncilMeetingItem();
  const deleteMut = useDeleteCouncilMeetingItem();

  function saveEdits() {
    updateMut.mutate(
      { id: meetingId, itemId: item.id, data: { title, description: description || null } as any },
      { onSuccess: () => { setEditing(false); toast({ title: "Item atualizado" }); } },
    );
  }

  function changeStatus(next: "pendente" | "discutida" | "decidida") {
    if (next === "decidida") {
      // Abre modal exigindo resolução
      setPendingStatus(next);
      setResolution(item.resolution ?? "");
      setShowResolve(true);
      return;
    }
    updateMut.mutate(
      { id: meetingId, itemId: item.id, data: { status: next } as any },
      { onSuccess: () => toast({ title: `Status: ${STATUS_LABELS[next]}` }) },
    );
  }

  function confirmResolve() {
    if (!resolution.trim()) {
      toast({ title: "Resolução obrigatória", variant: "destructive" });
      return;
    }
    updateMut.mutate(
      { id: meetingId, itemId: item.id, data: { status: "decidida", resolution } as any },
      {
        onSuccess: () => {
          setShowResolve(false);
          setPendingStatus(null);
          toast({ title: "Item decidido" });
        },
      },
    );
  }

  function remove() {
    if (!confirm(`Remover "${item.title}"?`)) return;
    deleteMut.mutate({ id: meetingId, itemId: item.id });
  }

  return (
    <li className="rounded-lg border bg-background/50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-sm font-mono text-muted-foreground w-6 mt-1">{item.order}.</span>

        <div className="flex-1 min-w-0 space-y-2">
          {editing ? (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm bg-background"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Descrição"
                className="w-full px-2 py-1 border rounded text-sm bg-background"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdits}
                  disabled={updateMut.isPending}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-xs"
                >
                  <Save className="h-3 w-3" /> Salvar
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setTitle(item.title); setDescription(item.description ?? ""); }}
                  className="flex items-center gap-1 px-3 py-1 border rounded text-xs"
                >
                  <X className="h-3 w-3" /> Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium text-sm">{item.title}</p>
              {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
              {item.status === "decidida" && item.resolution && (
                <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-xs">
                  <p className="font-medium text-emerald-800 mb-0.5">Resolução:</p>
                  <p className="text-emerald-700 whitespace-pre-wrap">{item.resolution}</p>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {(["pendente", "discutida", "decidida"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeStatus(s)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  item.status === s
                    ? STATUS_COLORS[s] + " font-semibold"
                    : "bg-background border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 rounded hover:bg-muted disabled:opacity-30"
            title="Mover para cima"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 rounded hover:bg-muted disabled:opacity-30"
            title="Mover para baixo"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-muted"
              title="Editar"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            className="p-1 rounded hover:bg-destructive/10 text-destructive"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Modal de resolução */}
      {showResolve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowResolve(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="font-bold mb-2">Marcar como Decidida</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Registre a decisão tomada para "{item.title}".
              </p>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={4}
                placeholder="Ex: Aprovado por unanimidade. Detalhes da decisão..."
                className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setShowResolve(false); setPendingStatus(null); }}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmResolve}
                  disabled={updateMut.isPending || !resolution.trim()}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
