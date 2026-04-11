import { useState, useRef, useEffect } from "react";
import { useListMembers } from "@workspace/api-client-react";
import { Search, User, Loader2 } from "lucide-react";

interface MemberSelectProps {
  value: string;
  onChange: (memberId: string, memberName: string) => void;
  placeholder?: string;
  excludeIds?: string[];
}

export function MemberSelect({ value, onChange, placeholder = "Buscar membro por nome...", excludeIds = [] }: MemberSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useListMembers(
    { search, limit: 10, page: 1 },
    { query: { enabled: search.length >= 2 } },
  );

  const members = (data?.members || []).filter((m: any) => !excludeIds.includes(m.id));

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (id: string, name: string) => {
    onChange(id, name);
    setSelectedName(name);
    setSearch("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("", "");
    setSelectedName("");
    setSearch("");
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected display or search input */}
      {value && selectedName ? (
        <div className="flex items-center justify-between w-full px-3 py-2 border rounded-lg bg-background text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{selectedName}</span>
          </div>
          <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-foreground text-xs">
            Alterar
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
            onFocus={() => { if (search.length >= 2) setIsOpen(true); }}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2 border rounded-lg bg-background text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && search.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-card border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && members.length === 0 && (
            <p className="text-sm text-muted-foreground py-3 px-3">Nenhum membro encontrado.</p>
          )}
          {members.map((m: any) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelect(m.id, m.fullName)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
            >
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium">{m.fullName}</p>
                {m.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
