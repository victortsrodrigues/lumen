import { useListFinanceClosings, useCloseFinanceMonth } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import { Lock, AlertTriangle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function FinanceClosings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data, isLoading } = useListFinanceClosings({
    query: { retry: 1 }
  });

  const closeMutation = useCloseFinanceMonth({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['listFinanceClosings'] });
        toast({ title: "Mês Fechado", description: "O mês foi fechado e os registros estão bloqueados." });
      },
      onError: (err: any) => toast({ title: "Erro", description: err.response?.data?.message || "Erro ao fechar mês", variant: "destructive" })
    }
  });

  const handleCloseCurrentMonth = () => {
    const today = new Date();
    const year = String(today.getFullYear());
    const month = String(today.getMonth() + 1).padStart(2, '0');
    
    if (confirm(`Atenção: Fechar o mês ${month}/${year} tornará todas as entradas e saídas deste período SOMENTE LEITURA. Esta ação não pode ser desfeita na interface. Deseja continuar?`)) {
      closeMutation.mutate({ data: { year, month, notes: "Fechamento automático pelo sistema" } });
    }
  };

  return (
    <AppLayout title="Fechamentos Mensais">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center">
            <Lock className="w-6 h-6 mr-3 text-warning" />
            Fechamentos Mensais
          </h2>
          <p className="text-muted-foreground mt-1">Congele registros financeiros de meses anteriores para segurança.</p>
        </div>
        <button 
          onClick={handleCloseCurrentMonth}
          disabled={closeMutation.isPending}
          className="flex items-center px-5 py-2.5 rounded-xl font-semibold text-sm bg-warning text-warning-foreground shadow-lg shadow-warning/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50"
        >
          {closeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
          Fechar Mês Atual
        </button>
      </div>

      <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl flex items-start gap-3 mb-8">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div className="text-sm text-warning-foreground">
          <p className="font-semibold mb-1">Sobre o Fechamento Mensal</p>
          <p>Uma vez que um mês é fechado, nenhuma nova entrada ou saída pode ser criada, editada ou excluída para aquele período. Isso garante a integridade dos relatórios financeiros já emitidos.</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/40 text-muted-foreground font-medium border-b border-border">
            <tr>
              <th className="px-6 py-4">Mês/Ano</th>
              <th className="px-6 py-4">Data do Fechamento</th>
              <th className="px-6 py-4">Observações</th>
              <th className="px-6 py-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...</td></tr>
            ) : data?.closings?.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">Nenhum mês foi fechado ainda.</td></tr>
            ) : (
              data?.closings?.map((closing: any) => (
                <tr key={closing.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 font-medium font-mono text-base">{closing.month}/{closing.year}</td>
                  <td className="px-6 py-4">{format(new Date(closing.closedAt), "dd/MM/yyyy HH:mm")}</td>
                  <td className="px-6 py-4 text-muted-foreground">{closing.notes || '-'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
                      <Lock className="w-3 h-3 mr-1" /> Fechado
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
