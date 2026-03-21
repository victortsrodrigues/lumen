import { useState } from "react";
import { useGetFinanceReport } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import { FileBarChart, Download, FileText, Search, Loader2 } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function FinanceReports() {
  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState("");
  
  // Use enabled: false to only fetch on demand, but we can also auto-fetch
  const { data, isLoading, refetch, isFetching } = useGetFinanceReport({
    query: {
      queryKey: ['financeReport', dateFrom, dateTo, type],
      enabled: !!dateFrom && !!dateTo,
      retry: 1
    },
    dateFrom,
    dateTo,
    type: type as any || undefined
  });

  const handleExportExcel = () => {
    if (!data) return;
    const entriesData = data.entries.map((e: any) => ({
      Data: format(new Date(e.date), 'dd/MM/yyyy'),
      Tipo: 'Entrada - ' + e.type,
      Descrição: e.memberName || e.donorName || 'Anônimo',
      Valor: parseFloat(e.amount),
    }));
    const expensesData = data.expenses.map((e: any) => ({
      Data: format(new Date(e.date), 'dd/MM/yyyy'),
      Tipo: 'Saída - ' + e.category,
      Descrição: e.description,
      Valor: -parseFloat(e.amount),
    }));

    const ws = XLSX.utils.json_to_sheet([...entriesData, ...expensesData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório Financeiro");
    XLSX.writeFile(wb, `relatorio-financeiro-${dateFrom}-a-${dateTo}.xlsx`);
  };

  const handleExportPDF = () => {
    if (!data) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Relatório Financeiro", 14, 22);
    doc.setFontSize(11);
    doc.text(`Período: ${format(new Date(dateFrom), 'dd/MM/yyyy')} a ${format(new Date(dateTo), 'dd/MM/yyyy')}`, 14, 30);
    
    doc.text(`Total Entradas: R$ ${data.totalEntries}`, 14, 40);
    doc.text(`Total Saídas: R$ ${data.totalExpenses}`, 14, 46);
    doc.text(`Saldo do Período: R$ ${data.balance}`, 14, 52);

    const tableData = [
      ...data.entries.map((e: any) => [format(new Date(e.date), 'dd/MM/yyyy'), 'Entrada', e.type, `R$ ${e.amount}`]),
      ...data.expenses.map((e: any) => [format(new Date(e.date), 'dd/MM/yyyy'), 'Saída', e.category, `R$ -${e.amount}`])
    ];

    (doc as any).autoTable({
      startY: 60,
      head: [['Data', 'Natureza', 'Categoria/Tipo', 'Valor']],
      body: tableData,
    });

    doc.save(`relatorio-financeiro-${dateFrom}-a-${dateTo}.pdf`);
  };

  return (
    <AppLayout title="Relatórios Financeiros">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center">
            <FileBarChart className="w-6 h-6 mr-3 text-primary" />
            Relatórios e Exportação
          </h2>
          <p className="text-muted-foreground mt-1">Gere relatórios customizados e exporte para PDF ou Excel.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExportExcel} disabled={!data || data.entries.length + data.expenses.length === 0} className="flex items-center px-4 py-2 rounded-xl font-medium text-sm border border-border bg-card hover:bg-success/10 hover:text-success hover:border-success/30 transition-all disabled:opacity-50">
            <Download className="w-4 h-4 mr-2" />
            Excel
          </button>
          <button onClick={handleExportPDF} disabled={!data || data.entries.length + data.expenses.length === 0} className="flex items-center px-4 py-2 rounded-xl font-medium text-sm border border-border bg-card hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all disabled:opacity-50">
            <FileText className="w-4 h-4 mr-2" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm mb-8">
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Inicial</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Final</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo (Entradas)</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all">
              <option value="">Todos</option>
              <option value="dizimo">Apenas Dízimos</option>
              <option value="oferta">Apenas Ofertas</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="w-full h-10 flex items-center justify-center rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors">
            <Search className="w-4 h-4 mr-2" /> Buscar
          </button>
        </div>
      </div>

      {isLoading || isFetching ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p>Gerando relatório...</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm text-center">
              <p className="text-muted-foreground text-sm mb-1">Total Entradas (Filtro)</p>
              <h3 className="text-2xl font-bold text-success font-mono">R$ {data.totalEntries}</h3>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm text-center">
              <p className="text-muted-foreground text-sm mb-1">Total Saídas (Filtro)</p>
              <h3 className="text-2xl font-bold text-destructive font-mono">R$ {data.totalExpenses}</h3>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm text-center bg-primary/5">
              <p className="text-muted-foreground text-sm mb-1">Saldo do Período</p>
              <h3 className="text-2xl font-bold text-primary font-mono">R$ {data.balance}</h3>
            </div>
          </div>
          
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden p-6 text-center text-muted-foreground">
             <p>A pré-visualização detalhada em tela não está disponível. Utilize os botões Exportar Excel ou PDF acima para obter os registros completos filtrados.</p>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
