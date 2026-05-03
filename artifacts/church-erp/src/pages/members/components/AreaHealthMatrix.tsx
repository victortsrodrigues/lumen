import { useGetDiscipleshipSummary } from "@workspace/api-client-react";
import { Link } from "wouter";

const AREAS: Array<{ key: string; label: string }> = [
  { key: "culto", label: "Culto" },
  { key: "pequeno_grupo", label: "Pequeno Grupo" },
  { key: "ministerio", label: "Ministério" },
  { key: "ebd", label: "EBD" },
];

const HEALTH_BAR: Record<string, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-500",
  vermelho: "bg-red-500",
};

export function AreaHealthMatrix() {
  const { data } = useGetDiscipleshipSummary();
  const matrix = (data as any)?.matrix as Record<string, Record<string, number>> | undefined;
  if (!matrix) return null;

  return (
    <div className="mb-6 p-4 rounded-xl border bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Saúde por Área de Discipulado</h3>
        <Link href="/discipleship" className="text-xs text-primary hover:underline">Ver detalhes →</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {AREAS.map(a => {
          const counts = matrix[a.key] ?? { verde: 0, amarelo: 0, vermelho: 0 };
          const total = (counts.verde ?? 0) + (counts.amarelo ?? 0) + (counts.vermelho ?? 0);
          return (
            <div key={a.key} className="rounded-lg border bg-background/50 p-3">
              <p className="text-xs font-semibold text-foreground mb-2">{a.label}</p>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                {(["verde", "amarelo", "vermelho"] as const).map(h => {
                  const v = counts[h] ?? 0;
                  const pct = total > 0 ? (v / total) * 100 : 0;
                  return pct > 0 ? (
                    <div key={h} className={HEALTH_BAR[h]} style={{ width: `${pct}%` }} title={`${v}`} />
                  ) : null;
                })}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="text-emerald-600">{counts.verde ?? 0}</span>
                <span className="text-amber-600">{counts.amarelo ?? 0}</span>
                <span className="text-red-600">{counts.vermelho ?? 0}</span>
                <span className="ml-auto font-medium text-foreground">{total}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
