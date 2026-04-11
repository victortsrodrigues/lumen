import { useState } from "react";
import { 
  useListFinanceExpenses, 
  useCreateFinanceExpense, 
  useUpdateFinanceExpense, 
  useDeleteFinanceExpense 
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  ArrowUpFromLine, Plus, Filter, Edit, Trash2, Loader2, Info, Receipt
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-lg rounded-3xl shadow-2xl border border-border flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-display font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-secondary transition-colors">&times;</button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

const expenseSchema = z.object({
  date: z.string().min(1, "Data é obrigatória"),
  amount: z.coerce.number().min(0.01, "Valor deve ser maior que zero"),
  category: z.enum(["aluguel", "agua", "luz", "internet", "salarios", "manutencao", "eventos", "missoes", "benevolencia", "material", "outros"]),
  description: z.string().min(3, "Descrição é obrigatória"),
  supplier: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  receiptPath: z.string().optional().nullable() // simplified for now
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

export default function FinanceExpenses() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useListFinanceExpenses({
    page, limit: 20, category: categoryFilter || undefined,
    dateFrom: dateFrom || undefined, dateTo: dateTo || undefined
  });

  const createMutation = useCreateFinanceExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        toast({ title: "Sucesso", description: "Despesa registrada com sucesso." });
        handleCloseModal();
      },
      onError: (err: any) => toast({ title: "Erro", description: err.response?.data?.message || "Erro ao salvar", variant: "destructive" })
    }
  });

  const updateMutation = useUpdateFinanceExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        toast({ title: "Sucesso", description: "Despesa atualizada com sucesso." });
        handleCloseModal();
      },
      onError: (err: any) => toast({ title: "Erro", description: err.response?.data?.message || "Erro ao atualizar", variant: "destructive" })
    }
  });

  const deleteMutation = useDeleteFinanceExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        toast({ title: "Excluído", description: "Despesa marcada como excluída (soft delete)." });
      },
      onError: (err: any) => toast({ title: "Erro", description: err.response?.data?.message || "Erro ao excluir", variant: "destructive" })
    }
  });

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: "manutencao", date: format(new Date(), 'yyyy-MM-dd') }
  });

  const handleOpenNew = () => {
    setEditingId(null);
    form.reset({ category: "manutencao", date: format(new Date(), 'yyyy-MM-dd') });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (expense: any) => {
    setEditingId(expense.id);
    form.reset({
      date: expense.date,
      amount: parseFloat(expense.amount),
      category: expense.category as any,
      description: expense.description,
      supplier: expense.supplier,
      notes: expense.notes,
      receiptPath: expense.receiptPath
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const onSubmit = (values: ExpenseFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      createMutation.mutate({ data: values });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta despesa? (Soft delete)")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <AppLayout breadcrumbs={[{ label: "Financeiro", href: "/finance" }, { label: "Despesas" }]}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center">
            <ArrowUpFromLine className="w-6 h-6 mr-3 text-destructive" />
            Despesas e Saídas
          </h2>
          <p className="text-muted-foreground mt-1">Gerencie os pagamentos e custos operacionais da igreja.</p>
        </div>
        <button 
          onClick={handleOpenNew}
          className="flex items-center px-5 py-2.5 rounded-xl font-semibold text-sm bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Despesa
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-secondary/20 flex flex-wrap gap-4 items-end">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="px-4 py-2 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            >
              <option value="">Todas as Categorias</option>
              <option value="aluguel">Aluguel</option>
              <option value="agua">Água</option>
              <option value="luz">Luz</option>
              <option value="internet">Internet</option>
              <option value="salarios">Salários/Prebendas</option>
              <option value="manutencao">Manutenção</option>
              <option value="eventos">Eventos</option>
              <option value="missoes">Missões</option>
              <option value="benevolencia">Benevolência/Ação Social</option>
              <option value="material">Material de Consumo</option>
              <option value="outros">Outros</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">De:</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Até:</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
          </div>
          {(dateFrom || dateTo || categoryFilter) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); setCategoryFilter(""); setPage(1); }} className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Limpar filtros
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/40 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4">Fornecedor</th>
                <th className="px-6 py-4 text-right">Valor (R$)</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...</td></tr>
              ) : data?.expenses?.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">Nenhuma despesa encontrada.</td></tr>
              ) : (
                data?.expenses?.map((expense: any) => (
                  <tr key={expense.id} className={`hover:bg-secondary/20 transition-colors ${expense.deletedAt ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4">{format(new Date(expense.date), "dd/MM/yyyy")}</td>
                    <td className="px-6 py-4 capitalize font-medium text-foreground">{expense.category}</td>
                    <td className="px-6 py-4">{expense.description}</td>
                    <td className="px-6 py-4 text-muted-foreground">{expense.supplier || '-'}</td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-destructive">
                      {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(parseFloat(expense.amount))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {!expense.deletedAt && !expense.monthClosingId && (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleOpenEdit(expense)} className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-primary/10 transition-colors" title="Editar">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(expense.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors" title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {expense.monthClosingId && (
                        <span className="text-xs text-muted-foreground flex items-center justify-center"><Info className="w-3 h-3 mr-1"/> Fechado</span>
                      )}
                      {expense.deletedAt && (
                        <span className="text-xs text-destructive flex items-center justify-center">Excluído</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total > 20 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {((page - 1) * 20) + 1}-{Math.min(page * 20, data.total)} de {data.total} registros
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <span className="px-4 py-2 text-sm font-medium text-muted-foreground">
              Página {page} de {Math.ceil(data.total / 20)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 20 >= data.total}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingId ? "Editar Despesa" : "Nova Despesa"}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Categoria</label>
              <select {...form.register("category")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all">
                <option value="aluguel">Aluguel</option>
                <option value="agua">Água</option>
                <option value="luz">Luz</option>
                <option value="internet">Internet</option>
                <option value="salarios">Salários/Prebendas</option>
                <option value="manutencao">Manutenção</option>
                <option value="eventos">Eventos</option>
                <option value="missoes">Missões</option>
                <option value="benevolencia">Benevolência</option>
                <option value="material">Material de Consumo</option>
                <option value="outros">Outros</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Data *</label>
              <input type="date" {...form.register("date")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
              {form.formState.errors.date && <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Descrição / Motivo *</label>
            <input type="text" {...form.register("description")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="Ex: Compra de cadeiras..." />
            {form.formState.errors.description && <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Valor (R$) *</label>
              <input type="number" inputMode="decimal" step="0.01" {...form.register("amount")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono" placeholder="0.00" />
              {form.formState.errors.amount && <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Fornecedor</label>
              <input type="text" {...form.register("supplier")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="Nome da empresa/pessoa" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Observações</label>
            <textarea {...form.register("notes")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none" rows={2} placeholder="Anotações extras..."></textarea>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <button type="button" onClick={handleCloseModal} className="px-5 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-6 py-2.5 rounded-xl font-semibold bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Salvar Alterações" : "Registrar Despesa"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
