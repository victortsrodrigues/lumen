import { useState } from "react";
import { useGetFinanceReport } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import { FileBarChart, Download, FileText, Search, Loader2 } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const formatCurrency = (value: string | number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
};

const categoryLabels: Record<string, string> = {
  aluguel: "Aluguel", agua: "Água", luz: "Luz", internet: "Internet",
  salarios: "Salários", manutencao: "Manutenção", eventos: "Eventos",
  missoes: "Missões", benevolencia: "Benevolência", material: "Material", outros: "Outros"
};

const typeLabels: Record<string, string> = {
  dizimo: "Dízimo", oferta: "Oferta", doacao: "Doação"
};

export default function FinanceReports() {
  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");

  const { data, isLoading, refetch, isFetching } = useGetFinanceReport(
    { dateFrom, dateTo, type: (type || undefined) as any, category: (category || undefined) as any },
    {
      query: {
        queryKey: ['financeReport', dateFrom, dateTo, type, category],
        enabled: !!dateFrom && !!dateTo,
        retry: 1,
      },
    }
  );

  const handleExportExcel = () => {
    if (!data) return;
    const entriesData = data.entries.map((e: any) => ({
      Data: format(new Date(e.date), 'dd/MM/yyyy'),
      Natureza: 'Entrada',
      Tipo: typeLabels[e.type] || e.type,
      'Origem/Descrição': e.memberName || e.donorName || 'Anônimo',
      'Forma Pgto': e.paymentMethod,
      Valor: parseFloat(e.amount),
    }));
    const expensesData = data.expenses.map((e: any) => ({
      Data: format(new Date(e.date), 'dd/MM/yyyy'),
      Natureza: 'Saída',
      Tipo: categoryLabels[e.category] || e.category,
      'Origem/Descrição': e.description,
      'Forma Pgto': '-',
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
      ...data.entries.map((e: any) => [
        format(new Date(e.date), 'dd/MM/yyyy'),
        'Entrada',
        typeLabels[e.type] || e.type,
        e.memberName || e.donorName || 'Anônimo',
        `R$ ${parseFloat(e.amount).toFixed(2)}`
      ]),
      ...data.expenses.map((e: any) => [
        format(new Date(e.date), 'dd/MM/yyyy'),
        'Saída',
        categoryLabels[e.category] || e.category,
        e.description,
        `R$ -${parseFloat(e.amount).toFixed(2)}`
      ])
    ];

    (doc as any).autoTable({
      startY: 60,
      head: [['Data', 'Natureza', 'Tipo/Categoria', 'Descrição', 'Valor']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`relatorio-financeiro-${dateFrom}-a-${dateTo}.pdf`);
  };

  const totalRecords = (data?.entries?.length ?? 0) + (data?.expenses?.length ?? 0);

  return (
    <AppLayout breadcrumbs={[{ label: "Financeiro", href: "/finance" }, { label: "Relatórios" }]}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center">
            <FileBarChart className="w-6 h-6 mr-3 text-primary" />
            Relatórios e Exportação
          </h2>
          <p className="text-muted-foreground mt-1">Gere relatórios customizados e exporte para PDF ou Excel.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExportExcel} disabled={!data || totalRecords === 0} className="flex items-center px-4 py-2 rounded-xl font-medium text-sm border border-border bg-card hover:bg-success/10 hover:text-success hover:border-success/30 transition-all disabled:opacity-50">
            <Download className="w-4 h-4 mr-2" />
            Excel
          </button>
          <button onClick={handleExportPDF} disabled={!data || totalRecords === 0} className="flex items-center px-4 py-2 rounded-xl font-medium text-sm border border-border bg-card hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all disabled:opacity-50">
            <FileText className="w-4 h-4 mr-2" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm mb-8">
        <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
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
              <option value="dizimo">Dízimos</option>
              <option value="oferta">Ofertas</option>
              <option value="doacao">Doações</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoria (Saídas)</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all">
              <option value="">Todas</option>
              <option value="aluguel">Aluguel</option>
              <option value="agua">Água</option>
              <option value="luz">Luz</option>
              <option value="internet">Internet</option>
              <option value="salarios">Salários</option>
              <option value="manutencao">Manutenção</option>
              <option value="eventos">Eventos</option>
              <option value="missoes">Missões</option>
              <option value="benevolencia">Benevolência</option>
              <option value="material">Material</option>
              <option value="outros">Outros</option>
            </select>
          </div>
          <button onClick={() => refetch()} className="w-full h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-sm">
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
              <p className="text-muted-foreground text-sm mb-1">Total Entradas</p>
              <h3 className="text-2xl font-bold text-success font-mono">{formatCurrency(data.totalEntries)}</h3>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm text-center">
              <p className="text-muted-foreground text-sm mb-1">Total Saídas</p>
              <h3 className="text-2xl font-bold text-destructive font-mono">{formatCurrency(data.totalExpenses)}</h3>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm text-center bg-primary/5">
              <p className="text-muted-foreground text-sm mb-1">Saldo do Período</p>
              <h3 className={`text-2xl font-bold font-mono ${parseFloat(data.balance) >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(data.balance)}
              </h3>
            </div>
          </div>

          {totalRecords > 0 && (
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-secondary/20">
                <h3 className="text-sm font-semibold text-foreground">{totalRecords} registro(s) encontrado(s)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary/40 text-muted-foreground font-medium border-b border-border">
                    <tr>
                      <th className="px-6 py-3">Data</th>
                      <th className="px-6 py-3">Natureza</th>
                      <th className="px-6 py-3">Tipo/Categoria</th>
                      <th className="px-6 py-3">Descrição</th>
                      <th className="px-6 py-3 text-right">Valor (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.entries.map((e: any) => (
                      <tr key={`e-${e.id}`} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-3">{format(new Date(e.date), "dd/MM/yyyy")}</td>
                        <td className="px-6 py-3"><span className="px-2 py-0.5 text-xs rounded-md bg-success/10 text-success font-medium">Entrada</span></td>
                        <td className="px-6 py-3 capitalize">{typeLabels[e.type] || e.type}</td>
                        <td className="px-6 py-3 text-muted-foreground">{e.memberName || e.donorName || (e.isAnonymous ? 'Anônimo' : '-')}</td>
                        <td className="px-6 py-3 text-right font-mono font-medium text-success">{formatCurrency(e.amount)}</td>
                      </tr>
                    ))}
                    {data.expenses.map((e: any) => (
                      <tr key={`x-${e.id}`} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-3">{format(new Date(e.date), "dd/MM/yyyy")}</td>
                        <td className="px-6 py-3"><span className="px-2 py-0.5 text-xs rounded-md bg-destructive/10 text-destructive font-medium">Saída</span></td>
                        <td className="px-6 py-3 capitalize">{categoryLabels[e.category] || e.category}</td>
                        <td className="px-6 py-3 text-muted-foreground">{e.description}{e.supplier ? ` (${e.supplier})` : ''}</td>
                        <td className="px-6 py-3 text-right font-mono font-medium text-destructive">-{formatCurrency(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totalRecords === 0 && (
            <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center text-muted-foreground">
              Nenhum registro encontrado para o período e filtros selecionados.
            </div>
          )}
        </div>
      ) : null}
    </AppLayout>
  );
}
