import { useState } from "react";
import { useListBudgets, useGetBudgetComparison } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loader2, BarChart3, DollarSign } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  dizimo: "Dízimo", oferta: "Oferta", doacao: "Doação",
  aluguel: "Aluguel", agua: "Água", luz: "Luz", internet: "Internet",
  salarios: "Salários", manutencao: "Manutenção", eventos: "Eventos",
  missoes: "Missões", benevolencia: "Benevolência", material: "Material", outros: "Outros",
};

const MONTH_LABELS = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatCurrency(v: string | number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    typeof v === "string" ? parseFloat(v) : v,
  );
}

export default function BudgetComparisonPage() {
  const currentYear = String(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"monthly" | "annual">("annual");
  const [selectedMonth, setSelectedMonth] = useState("01");

  const { data: budgetsData, isLoading: loadingList } = useListBudgets({ year: selectedYear });
  const { data: compData, isLoading: loadingComp } = useGetBudgetComparison(selectedBudgetId!, { query: { enabled: !!selectedBudgetId } });

  const budgets = budgetsData?.budgets || [];
  const comparison = compData?.comparison || [];

  // Auto-select first budget
  if (budgets.length > 0 && !selectedBudgetId) {
    const approved = budgets.find((b: any) => b.status === "aprovado");
    if (approved) setTimeout(() => setSelectedBudgetId((approved as any).id), 0);
    else setTimeout(() => setSelectedBudgetId((budgets[0] as any).id), 0);
  }

  // Aggregate data
  function getAggregated() {
    if (viewMode === "annual") {
      const byKey: Record<string, { type: string; category: string; planned: number; actual: number }> = {};
      for (const c of comparison as any[]) {
        const key = `${c.type}-${c.category}`;
        if (!byKey[key]) byKey[key] = { type: c.type, category: c.category, planned: 0, actual: 0 };
        byKey[key].planned += parseFloat(c.planned);
        byKey[key].actual += parseFloat(c.actual);
      }
      return Object.values(byKey).map(r => ({
        ...r,
        variance: r.planned - r.actual,
        variancePercent: r.planned > 0 ? Math.round(((r.planned - r.actual) / r.planned) * 100) : 0,
      }));
    } else {
      return (comparison as any[])
        .filter((c: any) => c.month === selectedMonth)
        .map((c: any) => ({
          type: c.type,
          category: c.category,
          planned: parseFloat(c.planned),
          actual: parseFloat(c.actual),
          variance: parseFloat(c.variance),
          variancePercent: c.variancePercent,
        }));
    }
  }

  const rows = getAggregated();
  const revenueRows = rows.filter(r => r.type === "receita");
  const expenseRows = rows.filter(r => r.type === "despesa");

  function getBarWidth(planned: number, actual: number): string {
    if (planned <= 0) return "0%";
    const pct = Math.min((actual / planned) * 100, 150);
    return `${pct}%`;
  }

  function getBarColor(variancePercent: number, type: string): string {
    if (type === "receita") {
      // For revenue: over target is good
      return variancePercent < 0 ? "bg-green-500" : variancePercent < 20 ? "bg-yellow-500" : "bg-red-500";
    }
    // For expenses: under budget is good
    return variancePercent > 0 ? "bg-green-500" : variancePercent > -20 ? "bg-yellow-500" : "bg-red-500";
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Financeiro", href: "/finance" }, { label: "Orçado vs. Realizado" }]}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> Orçado vs. Realizado
        </h1>
        <div className="flex items-center gap-3">
          <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedBudgetId(null); }} className="px-3 py-2 border rounded-lg bg-background text-sm">
            {[currentYear, String(+currentYear - 1), String(+currentYear + 1)].sort().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("annual")} className={`px-3 py-1.5 text-sm ${viewMode === "annual" ? "bg-primary text-primary-foreground" : "bg-card"}`}>Anual</button>
            <button onClick={() => setViewMode("monthly")} className={`px-3 py-1.5 text-sm ${viewMode === "monthly" ? "bg-primary text-primary-foreground" : "bg-card"}`}>Mensal</button>
          </div>
          {viewMode === "monthly" && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="px-3 py-2 border rounded-lg bg-background text-sm">
              {MONTH_LABELS.slice(1).map((m, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {(loadingList || loadingComp) && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {!loadingList && budgets.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Nenhum orçamento para {selectedYear}.</div>
      )}

      {comparison.length === 0 && selectedBudgetId && !loadingComp && (
        <div className="text-center py-12 text-muted-foreground">Orçamento sem itens para comparar.</div>
      )}

      {rows.length > 0 && (
        <div className="space-y-6">
          {/* Revenue */}
          {revenueRows.length > 0 && (
            <div className="rounded-2xl border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-green-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-green-800">Receitas</th>
                    <th className="text-right px-4 py-3 font-medium text-green-700">Orçado</th>
                    <th className="text-right px-4 py-3 font-medium text-green-700">Realizado</th>
                    <th className="text-right px-4 py-3 font-medium text-green-700">Variação</th>
                    <th className="px-4 py-3 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {revenueRows.map(r => (
                    <tr key={r.category} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{CATEGORY_LABELS[r.category] || r.category}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(r.planned)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.actual)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${r.variance >= 0 ? "text-red-600" : "text-green-600"}`}>
                        {r.variance >= 0 ? "-" : "+"}{formatCurrency(Math.abs(r.variance))} ({Math.abs(r.variancePercent)}%)
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full ${getBarColor(r.variancePercent, "receita")}`} style={{ width: getBarWidth(r.planned, r.actual) }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expenses */}
          {expenseRows.length > 0 && (
            <div className="rounded-2xl border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-red-800">Despesas</th>
                    <th className="text-right px-4 py-3 font-medium text-red-700">Orçado</th>
                    <th className="text-right px-4 py-3 font-medium text-red-700">Realizado</th>
                    <th className="text-right px-4 py-3 font-medium text-red-700">Variação</th>
                    <th className="px-4 py-3 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map(r => (
                    <tr key={r.category} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{CATEGORY_LABELS[r.category] || r.category}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(r.planned)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.actual)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${r.variance > 0 ? "text-green-600" : "text-red-600"}`}>
                        {r.variance > 0 ? "+" : ""}{formatCurrency(r.variance)} ({Math.abs(r.variancePercent)}%)
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full ${getBarColor(r.variancePercent, "despesa")}`} style={{ width: getBarWidth(r.planned, r.actual) }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
