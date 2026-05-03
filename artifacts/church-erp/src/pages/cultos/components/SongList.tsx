import { useState } from "react";
import {
  useReorderCultoSongs, useUpdateCultoSong, useDeleteCultoSong,
} from "@workspace/api-client-react";
import { ChevronUp, ChevronDown, Trash2, Music } from "lucide-react";

interface Song {
  id: string;
  songId: string;
  songTitle: string;
  order: number;
  notes: string | null;
}

interface Props {
  cultoId: string;
  songs: Song[];
  canEdit: boolean;
}

export function SongList({ cultoId, songs, canEdit }: Props) {
  const reorderMut = useReorderCultoSongs();
  const updateMut = useUpdateCultoSong();
  const deleteMut = useDeleteCultoSong();

  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  function moveUp(idx: number) {
    if (idx === 0) return;
    const ids = [...songs.map(s => s.id)];
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    reorderMut.mutate({ id: cultoId, data: { songIds: ids } });
  }

  function moveDown(idx: number) {
    if (idx === songs.length - 1) return;
    const ids = [...songs.map(s => s.id)];
    [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
    reorderMut.mutate({ id: cultoId, data: { songIds: ids } });
  }

  function saveNotes(songEntryId: string) {
    const value = editingNotes[songEntryId] ?? "";
    updateMut.mutate({ id: cultoId, songEntryId, data: { notes: value || null } });
    setEditingNotes(prev => {
      const next = { ...prev };
      delete next[songEntryId];
      return next;
    });
  }

  function remove(songEntryId: string) {
    if (!confirm("Remover esta música?")) return;
    deleteMut.mutate({ id: cultoId, songEntryId });
  }

  if (songs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-3">
        Nenhuma música adicionada ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {songs.map((s, idx) => (
        <li key={s.id} className="flex items-start gap-2 p-3 rounded-lg border bg-background/50">
          <Music className="h-4 w-4 text-primary mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
              <p className="font-medium text-sm">{s.songTitle}</p>
            </div>
            {canEdit ? (
              editingNotes[s.id] !== undefined ? (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={editingNotes[s.id]}
                    onChange={(e) => setEditingNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                    placeholder="Observação (ex: ofertório)"
                    className="flex-1 px-2 py-1 border rounded text-xs bg-background"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => saveNotes(s.id)}
                    className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs"
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingNotes(prev => ({ ...prev, [s.id]: s.notes ?? "" }))}
                  className="mt-1 text-xs text-muted-foreground hover:text-foreground italic"
                >
                  {s.notes || "+ adicionar observação"}
                </button>
              )
            ) : (
              s.notes && <p className="text-xs text-muted-foreground italic mt-1">{s.notes}</p>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0 || reorderMut.isPending}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
                title="Mover para cima"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={idx === songs.length - 1 || reorderMut.isPending}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
                title="Mover para baixo"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={deleteMut.isPending}
                className="p-1 rounded hover:bg-destructive/10 text-destructive"
                title="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
