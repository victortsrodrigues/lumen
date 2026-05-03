import { useEffect, useState } from "react";
import {
  useGetMemberAreas,
  useUpdateMemberArea,
  useGetMemberAreaHistory,
} from "@workspace/api-client-react";
import { Loader2, Activity } from "lucide-react";
import { MemberSelect } from "@/components/MemberSelect";
import { useToast } from "@/hooks/use-toast";

const AREAS: Array<{ key: "culto" | "pequeno_grupo" | "ministerio" | "ebd"; label: string }> = [
  { key: "culto", label: "Culto" },
  { key: "pequeno_grupo", label: "Pequeno Grupo" },
  { key: "ministerio", label: "Ministério" },
  { key: "ebd", label: "EBD" },
];

const HEALTH: Array<{ key: "verde" | "amarelo" | "vermelho"; label: string; cls: string }> = [
  { key: "verde", label: "Verde", cls: "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200" },
  { key: "amarelo", label: "Amarelo", cls: "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200" },
  { key: "vermelho", label: "Vermelho", cls: "bg-red-100 text-red-700 border-red-300 hover:bg-red-200" },
];

interface Props {
  memberId: string;
  memberName: string;
}

export function MemberAreasTab({ memberId, memberName }: Props) {
  const { toast } = useToast();
  const { data, isLoading } = useGetMemberAreas(memberId, { query: { enabled: !!memberId } });
  const { data: historyData } = useGetMemberAreaHistory(memberId, { query: { enabled: !!memberId } });
  const updateMut = useUpdateMemberArea();

  const areas = (data as any)?.areas as any[] | undefined;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-primary" /> Áreas de Discipulado — {memberName}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AREAS.map(area => {
            const row = areas?.find(a => a.area === area.key);
            return (
              <AreaCard
                key={area.key}
                memberId={memberId}
                area={area.key}
                areaLabel={area.label}
                row={row}
                onSave={(payload) => {
                  updateMut.mutate(
                    { id: memberId, area: area.key, data: payload },
                    {
                      onSuccess: () => toast({ title: "Salvo", description: `Área "${area.label}" atualizada.` }),
                    },
                  );
                }}
                pending={updateMut.isPending}
              />
            );
          })}
        </div>
      </div>

      {Array.isArray((historyData as any)?.items) && (historyData as any).items.length > 0 && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Mudanças recentes</h3>
          <ul className="space-y-2 text-xs">
            {(historyData as any).items.slice(0, 10).map((h: any) => (
              <li key={h.id} className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">{h.areaLabel}</span>
                <span className="text-muted-foreground">{h.fromHealth ?? "—"}</span>
                <span>→</span>
                <span className="font-medium text-foreground">{h.toHealth}</span>
                {h.reason && <span className="text-muted-foreground">— {h.reason}</span>}
                <span className="ml-auto text-muted-foreground">{h.createdAt && new Date(h.createdAt).toLocaleDateString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface AreaCardProps {
  memberId: string;
  area: "culto" | "pequeno_grupo" | "ministerio" | "ebd";
  areaLabel: string;
  row: any;
  onSave: (payload: any) => void;
  pending: boolean;
}

function AreaCard({ memberId, area, areaLabel, row, onSave, pending }: AreaCardProps) {
  const [healthStatus, setHealthStatus] = useState<string>(row?.healthStatus ?? "verde");
  const [leaderId, setLeaderId] = useState<string>(row?.leaderMemberId ?? "");
  const [leaderName, setLeaderName] = useState<string>(row?.leaderMemberName ?? "");
  const [notes, setNotes] = useState<string>(row?.notes ?? "");

  useEffect(() => {
    if (row) {
      setHealthStatus(row.healthStatus);
      setLeaderId(row.leaderMemberId ?? "");
      setLeaderName(row.leaderMemberName ?? "");
      setNotes(row.notes ?? "");
    }
  }, [row?.id]);

  const dirty =
    row && (
      healthStatus !== row.healthStatus ||
      (leaderId || null) !== (row.leaderMemberId ?? null) ||
      (notes || null) !== (row.notes ?? null)
    );

  return (
    <div className="rounded-xl border bg-background/50 p-4 space-y-3">
      <p className="font-semibold text-sm">{areaLabel}</p>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Cor de saúde</p>
        <div className="flex gap-2">
          {HEALTH.map(h => (
            <button
              key={h.key}
              type="button"
              onClick={() => setHealthStatus(h.key)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-all ${
                healthStatus === h.key ? h.cls : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Líder / Referência</p>
        <MemberSelect
          value={leaderId}
          onChange={(id, name) => { setLeaderId(id || ""); setLeaderName(name || ""); }}
          initialName={leaderName}
          excludeIds={[memberId]}
          placeholder="Selecionar líder…"
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Notas</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-1.5 border rounded-md text-sm bg-background"
          placeholder="Observações da liderança…"
        />
      </div>

      <button
        type="button"
        onClick={() => onSave({
          healthStatus,
          leaderMemberId: leaderId || null,
          notes: notes || null,
        })}
        disabled={!dirty || pending}
        className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
