import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import {
  useGetDiscipleshipSummary,
  useGetDiscipleshipAtRisk,
  useGetDiscipleshipLeaders,
} from "@workspace/api-client-react";
import { Activity, AlertTriangle, Users, Loader2 } from "lucide-react";
import { Link, Redirect } from "wouter";

const AREAS: Array<{ key: "culto" | "pequeno_grupo" | "ministerio" | "ebd"; label: string }> = [
  { key: "culto", label: "Culto" },
  { key: "pequeno_grupo", label: "Pequeno Grupo" },
  { key: "ministerio", label: "Ministério" },
  { key: "ebd", label: "EBD" },
];

const HEALTH_BG: Record<string, string> = {
  verde: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amarelo: "bg-amber-50 text-amber-700 border-amber-200",
  vermelho: "bg-red-50 text-red-700 border-red-200",
};

export default function DiscipleshipPage() {
  const { user } = useAuth();

  const { data: summary, isLoading: summaryLoading } = useGetDiscipleshipSummary();
  const { data: atRisk, isLoading: atRiskLoading } = useGetDiscipleshipAtRisk();
  const { data: leaders } = useGetDiscipleshipLeaders();

  if (user?.role === "member") return <Redirect to="/" />;

  const matrix = (summary as any)?.matrix as Record<string, Record<string, number>> | undefined;
  const atRiskItems = ((atRisk as any)?.items ?? []) as any[];
  const leaderItems = ((leaders as any)?.items ?? []) as any[];

  return (
    <AppLayout breadcrumbs={[{ label: "Discipulado" }]}>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold flex items-center gap-2">
          <Activity className="h-7 w-7 text-primary" /> Mapa de Discipulado
        </h1>
        <p className="text-muted-foreground mt-1">
          Acompanhe a saúde dos membros nas 4 áreas: culto, pequeno grupo, ministério e EBD.
        </p>
      </div>

      {/* Matrix */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Matriz de Saúde por Área</h2>
        {summaryLoading || !matrix ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2">Área</th>
                  <th className="py-2 text-center">Ativo</th>
                  <th className="py-2 text-center">Irregular</th>
                  <th className="py-2 text-center">Ausente</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {AREAS.map(a => {
                  const counts = matrix[a.key] ?? { verde: 0, amarelo: 0, vermelho: 0 };
                  const total = (counts.verde ?? 0) + (counts.amarelo ?? 0) + (counts.vermelho ?? 0);
                  return (
                    <tr key={a.key} className="border-b last:border-0">
                      <td className="py-3 font-medium">{a.label}</td>
                      <td className="py-3 text-center"><span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">{counts.verde ?? 0}</span></td>
                      <td className="py-3 text-center"><span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">{counts.amarelo ?? 0}</span></td>
                      <td className="py-3 text-center"><span className="px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-200">{counts.vermelho ?? 0}</span></td>
                      <td className="py-3 text-right font-semibold">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* At Risk */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" /> Em risco
          </h2>
          {atRiskLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : atRiskItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum membro em risco. Bom trabalho!</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {atRiskItems.slice(0, 25).map((item: any, idx: number) => (
                <li key={`${item.memberId}-${item.area}-${idx}`} className="flex items-center gap-2">
                  <Link href={`/members/${item.memberId}`} className="flex-1 hover:underline">
                    <span className="font-medium text-sm">{item.memberName}</span>
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-md border ${HEALTH_BG[item.healthStatus] ?? ""}`}>
                    {item.areaLabel}
                  </span>
                  {item.leaderMemberName && (
                    <span className="text-xs text-muted-foreground">· {item.leaderMemberName}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Leaders */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Líderes ativos
          </h2>
          {leaderItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum líder atribuído ainda.</p>
          ) : (
            <ul className="space-y-2">
              {leaderItems.map((l: any) => (
                <li key={l.leaderMemberId} className="flex items-center justify-between">
                  <Link href={`/discipleship/by-leader/${l.leaderMemberId}`} className="flex-1 hover:underline">
                    <span className="font-medium text-sm">{l.leaderMemberName}</span>
                  </Link>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {l.total} discipulado{l.total === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
