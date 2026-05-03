import { useState } from "react";
import { useListSongs } from "@workspace/api-client-react";
import { X, Search, Music, Loader2 } from "lucide-react";

interface Props {
  excludeIds?: string[];
  onPick: (songId: string, songTitle: string) => void;
  onClose: () => void;
}

export function SongPicker({ excludeIds = [], onPick, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const { data, isLoading } = useListSongs({
    search: search || undefined,
    category: category || undefined,
    limit: 50,
  } as any);

  const songs = ((data as any)?.songs ?? []).filter((s: any) => !excludeIds.includes(s.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" /> Adicionar Música
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg bg-background text-sm"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todas as categorias</option>
            <option value="louvor">Louvor</option>
            <option value="adoracao">Adoração</option>
            <option value="hino">Hino</option>
            <option value="especial">Especial</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : songs.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              Nenhuma música encontrada.
            </p>
          ) : (
            <ul className="space-y-1">
              {songs.map((s: any) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => { onPick(s.id, s.title); onClose(); }}
                    className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.author ?? "Autor desconhecido"}
                      {s.category ? ` · ${s.category}` : ""}
                      {s.songKey ? ` · Tom ${s.songKey}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
