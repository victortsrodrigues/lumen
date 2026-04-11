import { useState } from "react";
import { 
  useListFinanceEntries, 
  useCreateFinanceEntry, 
  useUpdateFinanceEntry, 
  useDeleteFinanceEntry 
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  ArrowDownToLine, Plus, Search, Filter, MoreVertical, 
  Edit, Trash2, Loader2, Info
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Basic Dialog fallback since we can't guarantee shadcn components structure fully
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

const entrySchema = z.object({
  type: z.enum(["dizimo", "oferta", "doacao"]),
  date: z.string().min(1, "Data é obrigatória"),
  amount: z.coerce.number().min(0.01, "Valor deve ser maior que zero"),
  paymentMethod: z.enum(["dinheiro", "pix", "transferencia", "cartao"]),
  isAnonymous: z.boolean().default(false),
  memberId: z.string().optional().nullable(),
  donorName: z.string().optional().nullable(),
  offeringType: z.enum(["regular", "missionaria", "especial", "construcao"]).optional().nullable(),
  donationPurpose: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

type EntryFormValues = z.infer<typeof entrySchema>;

export default function FinanceEntries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useListFinanceEntries({
    page, limit: 20, type: typeFilter || undefined,
    dateFrom: dateFrom || undefined, dateTo: dateTo || undefined
  });

  const createMutation = useCreateFinanceEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        toast({ title: "Sucesso", description: "Entrada registrada com sucesso." });
        handleCloseModal();
      },
      onError: (err: any) => toast({ title: "Erro", description: err.response?.data?.message || "Erro ao salvar", variant: "destructive" })
    }
  });

  const updateMutation = useUpdateFinanceEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        toast({ title: "Sucesso", description: "Entrada atualizada com sucesso." });
        handleCloseModal();
      },
      onError: (err: any) => toast({ title: "Erro", description: err.response?.data?.message || "Erro ao atualizar", variant: "destructive" })
    }
  });

  const deleteMutation = useDeleteFinanceEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
        toast({ title: "Excluído", description: "Registro marcado como excluído (soft delete)." });
      },
      onError: (err: any) => toast({ title: "Erro", description: err.response?.data?.message || "Erro ao excluir", variant: "destructive" })
    }
  });

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { type: "dizimo", paymentMethod: "pix", isAnonymous: false }
  });

  const watchType = form.watch("type");
  const watchAnonymous = form.watch("isAnonymous");

  const handleOpenNew = () => {
    setEditingId(null);
    form.reset({ type: "dizimo", paymentMethod: "pix", isAnonymous: false, date: format(new Date(), 'yyyy-MM-dd') });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entry: any) => {
    setEditingId(entry.id);
    form.reset({
      type: entry.type as any,
      date: entry.date,
      amount: parseFloat(entry.amount),
      paymentMethod: entry.paymentMethod as any,
      isAnonymous: entry.isAnonymous,
      memberId: entry.memberId,
      donorName: entry.donorName,
      offeringType: entry.offeringType,
      donationPurpose: entry.donationPurpose,
      notes: entry.notes
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const onSubmit = (values: EntryFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      createMutation.mutate({ data: values });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este registro? Ele será mantido no banco por obrigação fiscal (soft delete).")) {
      deleteMutation.mutate({ id });
    }
  };

  const getTypeBadge = (type: string) => {
    switch(type) {
      case 'dizimo': return <span className="px-2 py-1 text-xs rounded-md bg-primary/10 text-primary font-medium">Dízimo</span>;
      case 'oferta': return <span className="px-2 py-1 text-xs rounded-md bg-success/10 text-success font-medium">Oferta</span>;
      case 'doacao': return <span className="px-2 py-1 text-xs rounded-md bg-accent/10 text-accent font-medium">Doação</span>;
      default: return null;
    }
  };

  return (
    <AppLayout breadcrumbs={[{ label: "Financeiro", href: "/finance" }, { label: "Entradas" }]}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center">
            <ArrowDownToLine className="w-6 h-6 mr-3 text-success" />
            Entradas Financeiras
          </h2>
          <p className="text-muted-foreground mt-1">Dízimos, ofertas e doações recebidas.</p>
        </div>
        <button 
          onClick={handleOpenNew}
          className="flex items-center px-5 py-2.5 rounded-xl font-semibold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Entrada
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-secondary/20 flex flex-wrap gap-4 items-end">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="px-4 py-2 rounded-lg bg-background border border-border text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            >
              <option value="">Todos os Tipos</option>
              <option value="dizimo">Dízimos</option>
              <option value="oferta">Ofertas</option>
              <option value="doacao">Doações</option>
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
          {(dateFrom || dateTo || typeFilter) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); setTypeFilter(""); setPage(1); }} className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Limpar filtros
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/40 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Origem / Membro</th>
                <th className="px-6 py-4">Método</th>
                <th className="px-6 py-4 text-right">Valor (R$)</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...</td></tr>
              ) : data?.entries?.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">Nenhuma entrada encontrada.</td></tr>
              ) : (
                data?.entries?.map((entry: any) => (
                  <tr key={entry.id} className={`hover:bg-secondary/20 transition-colors ${entry.deletedAt ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4">{format(new Date(entry.date), "dd/MM/yyyy")}</td>
                    <td className="px-6 py-4">{getTypeBadge(entry.type)}</td>
                    <td className="px-6 py-4">
                      {entry.isAnonymous ? (
                        <span className="text-muted-foreground italic">Anônimo</span>
                      ) : entry.type === 'doacao' ? (
                        <span className="font-medium">{entry.donorName || '-'}</span>
                      ) : (
                        <span className="font-medium">{entry.memberName || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 capitalize">{entry.paymentMethod}</td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-success">
                      {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(parseFloat(entry.amount))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {!entry.deletedAt && !entry.monthClosingId && (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleOpenEdit(entry)} className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-primary/10 transition-colors" title="Editar">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(entry.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors" title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {entry.monthClosingId && (
                        <span className="text-xs text-muted-foreground flex items-center justify-center"><Info className="w-3 h-3 mr-1"/> Fechado</span>
                      )}
                      {entry.deletedAt && (
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

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingId ? "Editar Entrada" : "Nova Entrada"}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Tipo de Entrada</label>
              <select {...form.register("type")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all">
                <option value="dizimo">Dízimo</option>
                <option value="oferta">Oferta</option>
                <option value="doacao">Doação</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Data *</label>
              <input type="date" {...form.register("date")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
              {form.formState.errors.date && <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Valor (R$) *</label>
              <input type="number" inputMode="decimal" step="0.01" {...form.register("amount")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono" placeholder="0.00" />
              {form.formState.errors.amount && <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Forma de Pagamento</label>
              <select {...form.register("paymentMethod")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all">
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">PIX</option>
                <option value="transferencia">Transferência</option>
                <option value="cartao">Cartão</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border border-border">
            <input type="checkbox" id="isAnonymous" {...form.register("isAnonymous")} className="w-4 h-4 rounded text-primary focus:ring-primary/20" />
            <label htmlFor="isAnonymous" className="text-sm font-medium text-foreground select-none cursor-pointer">Lançamento Anônimo</label>
          </div>

          {!watchAnonymous && watchType === 'dizimo' && (
             <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">ID do Membro (Opcional por enquanto)</label>
              <input type="text" {...form.register("memberId")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="ID do membro..." />
            </div>
          )}

          {watchType === 'oferta' && (
             <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Tipo de Oferta</label>
              <select {...form.register("offeringType")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all">
                <option value="regular">Regular</option>
                <option value="missionaria">Missionária</option>
                <option value="especial">Especial</option>
                <option value="construcao">Construção</option>
              </select>
            </div>
          )}

          {watchType === 'doacao' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Nome do Doador Externo</label>
              <input type="text" {...form.register("donorName")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="Ex: Empresa Silva LTDA" />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Observações</label>
            <textarea {...form.register("notes")} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none" rows={3} placeholder="Anotações adicionais..."></textarea>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <button type="button" onClick={handleCloseModal} className="px-5 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-6 py-2.5 rounded-xl font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Salvar Alterações" : "Registrar Entrada"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
