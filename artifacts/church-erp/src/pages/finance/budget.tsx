import { useState } from "react";
import {
  useListBudgets, useCreateBudget, useGetBudgetDetail, useUpdateBudget,
  useDeleteBudget, useAddBudgetItems, useDeleteBudgetItem, useUpdateBudgetItem,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { Loader2, Plus, X, Trash2, Check, DollarSign } from "lucide-react";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const EXPENSE_CATS: Record<string, string> = {
  aluguel: "Aluguel", agua: "Água", luz: "Luz", internet: "Internet",
  salarios: "Salários", manutencao: "Manutenção", eventos: "Eventos",
  missoes: "Missões", benevolencia: "Benevolência", material: "Material", outros: "Outros",
};
const REVENUE_CATS: Record<string, string> = { dizimo: "Dízimo", oferta: "Oferta", doacao: "Doação" };

const STATUS_LABELS: Record<string, string> = { rascunho: "Rascunho", aprovado: "Aprovado", encerrado: "Encerrado" };
const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-yellow-100 text-yellow-800", aprovado: "bg-green-100 text-green-800", encerrado: "bg-slate-100 text-slate-800",
};

export default function BudgetPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const currentYear = String(new Date().getFullYear());

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<"receita" | "despesa">("receita");
  const [addCategory, setAddCategory] = useState("");
  const [addValues, setAddValues] = useState<Record<string, string>>({});

  const { data: budgetsData, isLoading: loadingList } = useListBudgets({ year: selectedYear });
  const { data: budgetDetail } = useGetBudgetDetail(selectedBudgetId!, { query: { enabled: !!selectedBudgetId } });

  const createMut = useCreateBudget({ mutation: { onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["/api/finance/budgets"] }); setSelectedBudgetId(d.id); toast({ title: "Sucesso", description: "Orçamento criado." }); } } });
  const updateMut = useUpdateBudget({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/finance/budgets"] }); qc.invalidateQueries({ queryKey: ["/api/finance/budgets"] }); toast({ title: "Sucesso", description: "Orçamento atualizado." }); } } });
  const deleteMut = useDeleteBudget({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/finance/budgets"] }); setSelectedBudgetId(null); toast({ title: "Sucesso", description: "Orçamento removido." }); } } });
  const addItemsMut = useAddBudgetItems({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/finance/budgets"] }); toast({ title: "Sucesso", description: "Itens adicionados." }); setShowAddModal(false); setAddValues({}); } , onError: (e: any) => toast({ title: "Erro", description: e?.response?.data?.error || "Falha.", variant: "destructive" }) } });
  const deleteItemMut = useDeleteBudgetItem({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/finance/budgets"] }); } } });

  const budgets = budgetsData?.budgets || [];
  const items = (budgetDetail as any)?.items || [];
  const isDraft = (budgetDetail as any)?.status === "rascunho";

  // Group items
  const revenueItems = items.filter((i: any) => i.type === "receita");
  const expenseItems = items.filter((i: any) => i.type === "despesa");

  // Get total per month
  function getVal(list: any[], cat: string, month: string): string {
    const item = list.find((i: any) => i.category === cat && i.month === month);
    return item?.plannedAmount || "";
  }

  function getRowTotal(list: any[], cat: string): number {
    return MONTHS.reduce((sum, _, i) => {
      const m = String(i + 1).padStart(2, "0");
      return sum + parseFloat(getVal(list, cat, m) || "0");
    }, 0);
  }

  function handleAddItems() {
    const itemsToAdd = Object.entries(addValues)
      .filter(([_, v]) => v && parseFloat(v) > 0)
      .map(([month, amount]) => ({ type: addType, category: addCategory, month, plannedAmount: amount }));
    if (itemsToAdd.length === 0) return;
    addItemsMut.mutate({ id: selectedBudgetId!, data: { items: itemsToAdd } });
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Financeiro", href: "/finance" }, { label: "Orçamento" }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><DollarSign className="h-6 w-6" /> Orçamento</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedBudgetId(null); }} className="px-3 py-2 border rounded-lg bg-background text-sm">
            {[currentYear, String(+currentYear - 1), String(+currentYear + 1)].sort().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <button onClick={() => createMut.mutate({ data: { year: selectedYear } })} disabled={createMut.isPending} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Novo Orçamento
            </button>
          )}
        </div>
      </div>

      {loadingList && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {/* Budget selector */}
      {budgets.length > 0 && (
        <div className="flex gap-3 mb-6">
          {budgets.map((b: any) => (
            <button key={b.id} onClick={() => setSelectedBudgetId(b.id)} className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${selectedBudgetId === b.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}>
              {b.year} <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status]}`}>{STATUS_LABELS[b.status]}</span>
            </button>
          ))}
        </div>
      )}

      {budgets.length === 0 && !loadingList && (
        <div className="text-center py-12 text-muted-foreground">Nenhum orçamento para {selectedYear}.</div>
      )}

      {/* Budget detail table */}
      {selectedBudgetId && budgetDetail && (
        <div className="space-y-6">
          {/* Actions */}
          {isAdmin && (
            <div className="flex gap-2">
              {isDraft && (
                <>
                  <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-secondary"><Plus className="h-3.5 w-3.5" /> Adicionar Linha</button>
                  <button onClick={() => updateMut.mutate({ id: selectedBudgetId, data: { status: "aprovado" } })} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"><Check className="h-3.5 w-3.5" /> Aprovar</button>
                  <button onClick={() => { if (confirm("Remover orçamento?")) deleteMut.mutate({ id: selectedBudgetId }); }} className="flex items-center gap-1 px-3 py-1.5 border border-destructive text-destructive rounded-lg text-sm hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                </>
              )}
            </div>
          )}

          {/* Revenue table */}
          {Object.keys(REVENUE_CATS).length > 0 && (
            <div className="rounded-2xl border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-green-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-green-800">Receitas</th>
                    {MONTHS.map((m, i) => <th key={i} className="px-2 py-3 text-center font-medium text-green-700 w-20">{m}</th>)}
                    <th className="px-4 py-3 text-right font-semibold text-green-800">Total</th>
                    {isDraft && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(REVENUE_CATS).map(([cat, label]) => {
                    const hasData = revenueItems.some((i: any) => i.category === cat);
                    if (!hasData) return null;
                    return (
                      <tr key={cat} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{label}</td>
                        {MONTHS.map((_, i) => {
                          const m = String(i + 1).padStart(2, "0");
                          const v = getVal(revenueItems, cat, m);
                          return <td key={i} className="px-2 py-2 text-center text-muted-foreground">{v ? `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` : "—"}</td>;
                        })}
                        <td className="px-4 py-2 text-right font-semibold">R$ {getRowTotal(revenueItems, cat).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        {isDraft && <td></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Expense table */}
          {Object.keys(EXPENSE_CATS).length > 0 && (
            <div className="rounded-2xl border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-red-800">Despesas</th>
                    {MONTHS.map((m, i) => <th key={i} className="px-2 py-3 text-center font-medium text-red-700 w-20">{m}</th>)}
                    <th className="px-4 py-3 text-right font-semibold text-red-800">Total</th>
                    {isDraft && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(EXPENSE_CATS).map(([cat, label]) => {
                    const hasData = expenseItems.some((i: any) => i.category === cat);
                    if (!hasData) return null;
                    return (
                      <tr key={cat} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{label}</td>
                        {MONTHS.map((_, i) => {
                          const m = String(i + 1).padStart(2, "0");
                          const v = getVal(expenseItems, cat, m);
                          return <td key={i} className="px-2 py-2 text-center text-muted-foreground">{v ? `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` : "—"}</td>;
                        })}
                        <td className="px-4 py-2 text-right font-semibold">R$ {getRowTotal(expenseItems, cat).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        {isDraft && <td></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {items.length === 0 && <div className="text-center py-8 text-muted-foreground">Nenhum item no orçamento. Clique em "Adicionar Linha" para começar.</div>}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Adicionar Linha ao Orçamento</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <select value={addType} onChange={e => { setAddType(e.target.value as any); setAddCategory(""); }} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                    <option value="receita">Receita</option>
                    <option value="despesa">Despesa</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Categoria</label>
                  <select value={addCategory} onChange={e => setAddCategory(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                    <option value="">Selecione...</option>
                    {Object.entries(addType === "receita" ? REVENUE_CATS : EXPENSE_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              {addCategory && (
                <div className="grid grid-cols-4 gap-2">
                  {MONTHS.map((m, i) => {
                    const month = String(i + 1).padStart(2, "0");
                    return (
                      <div key={i}>
                        <label className="text-xs text-muted-foreground">{m}</label>
                        <input type="number" inputMode="decimal" step="0.01" value={addValues[month] || ""} onChange={e => setAddValues(v => ({ ...v, [month]: e.target.value }))} className="w-full px-2 py-1.5 border rounded-lg bg-background text-sm" placeholder="0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleAddItems} disabled={!addCategory || addItemsMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                {addItemsMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
