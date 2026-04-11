import { useGetPlanningSummary, useListDirectives } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useLocation } from "wouter";
import { Target, AlertTriangle, Loader2, ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";

function formatCurrency(v: string | number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    typeof v === "string" ? parseFloat(v) : v,
  );
}

const STATUS_LABELS: Record<string, string> = {
  planejada: "Planejada", aprovada: "Aprovada", em_andamento: "Em Andamento",
  concluida: "Concluída", cancelada: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  planejada: "bg-slate-100 text-slate-800", aprovada: "bg-blue-100 text-blue-800",
  em_andamento: "bg-amber-100 text-amber-800", concluida: "bg-green-100 text-green-800",
  cancelada: "bg-red-100 text-red-800",
};

export default function PlanningDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: summary, isLoading: loadingSummary } = useGetPlanningSummary();
  const { data: directivesData } = useListDirectives();

  const directives = directivesData?.directives || [];

  return (
    <AppLayout breadcrumbs={[{ label: "Planejamento" }]}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6" /> Planejamento Estratégico
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setLocation("/planning/directives")} className="px-4 py-2 border rounded-xl text-sm hover:bg-secondary">Diretrizes</button>
          <button onClick={() => setLocation("/planning/initiatives")} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90">Iniciativas</button>
        </div>
      </div>

      {loadingSummary && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {summary && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Iniciativas</p>
              <p className="text-2xl font-bold">{summary.totalInitiatives}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Ativas</p>
              <p className="text-2xl font-bold text-blue-600">{summary.activeInitiatives}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Atrasadas</p>
              <p className={`text-2xl font-bold ${summary.overdueInitiatives > 0 ? "text-red-600" : "text-green-600"}`}>{summary.overdueInitiatives}</p>
            </div>
            {isAdmin && (
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Orçamento Planejado</p>
                <p className="text-xl font-bold">{formatCurrency(summary.totalPlannedBudget || "0")}</p>
                <p className="text-xs text-muted-foreground mt-1">Realizado: {formatCurrency(summary.totalRealizedCost || "0")}</p>
              </div>
            )}
          </div>

          {/* Status breakdown */}
          {summary.byStatus && Object.keys(summary.byStatus).length > 0 && (
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Por Status</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(summary.byStatus as Record<string, number>).map(([status, cnt]) => (
                  <span key={status} className={`px-3 py-1.5 rounded-full text-sm font-medium ${STATUS_COLORS[status] || "bg-slate-100"}`}>
                    {STATUS_LABELS[status] || status}: {cnt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Overdue alert */}
          {summary.overdueInitiatives > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <p className="font-medium text-red-800">{summary.overdueInitiatives} iniciativa(s) atrasada(s)</p>
                <p className="text-sm text-red-600">Verifique prazos e atualize os status.</p>
              </div>
              <button onClick={() => setLocation("/planning/initiatives")} className="ml-auto text-sm text-red-700 hover:underline flex items-center gap-1">
                Ver <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Directives overview */}
          {directives.length > 0 && (
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Diretrizes Estratégicas</h3>
              <div className="space-y-3">
                {directives.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 cursor-pointer hover:bg-muted/80" onClick={() => setLocation(`/planning/directives`)}>
                    <div>
                      <p className="font-medium text-sm">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.startYear} — {d.endYear}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.status === "ativa" ? "bg-green-100 text-green-800" : d.status === "concluida" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"}`}>
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
