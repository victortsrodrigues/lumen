import { useGetFinanceDashboard } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts";
import { 
  TrendingUp, TrendingDown, DollarSign, Wallet, 
  ArrowUpRight, ArrowDownRight, Loader2, AlertCircle 
} from "lucide-react";

const formatCurrency = (value: string | number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
};

export default function FinanceDashboard() {
  const { data, isLoading, isError } = useGetFinanceDashboard({
    query: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  });

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Financeiro" }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium animate-pulse">Carregando dados financeiros...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Financeiro" }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-destructive bg-destructive/10 p-8 rounded-3xl border border-destructive/20">
            <AlertCircle className="h-12 w-12" />
            <p className="font-semibold text-lg">Erro ao carregar o dashboard.</p>
            <p className="text-sm opacity-80">Verifique sua conexão ou tente novamente mais tarde.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const { totalBalance, currentMonth, chartData, topExpenseCategories } = data;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } }
  };

  return (
    <AppLayout breadcrumbs={[{ label: "Financeiro" }]}>
      <div className="mb-8 relative overflow-hidden rounded-3xl p-8 border border-border/50 bg-card shadow-sm">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/finance-hero.png`}
            alt="Finance Background" 
            className="w-full h-full object-cover opacity-10 dark:opacity-20 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/50"></div>
        </div>
        
        <div className="relative z-10">
          <h2 className="text-3xl font-display font-bold text-foreground mb-2 flex items-center gap-3">
            <Wallet className="w-8 h-8 text-primary" />
            Visão Geral Financeira
          </h2>
          <p className="text-muted-foreground max-w-2xl">
            Acompanhe a saúde financeira da sua igreja, receitas, despesas e retenções com transparência e segurança.
          </p>
        </div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
      >
        <motion.div variants={itemVariants} className="bg-card rounded-2xl p-6 border border-border shadow-sm relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold px-2 py-1 bg-secondary text-muted-foreground rounded-full">Saldo Acumulado</span>
          </div>
          <p className="text-muted-foreground text-sm mb-1">Saldo em Caixa</p>
          <h3 className="text-3xl font-display font-bold text-foreground">
            {formatCurrency(totalBalance)}
          </h3>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-card rounded-2xl p-6 border border-border shadow-sm relative overflow-hidden group">
           <div className="absolute -right-6 -top-6 w-24 h-24 bg-success/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-success/10 text-success rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold px-2 py-1 bg-secondary text-muted-foreground rounded-full">Mês Atual</span>
          </div>
          <p className="text-muted-foreground text-sm mb-1">Entradas do Mês</p>
          <h3 className="text-3xl font-display font-bold text-success flex items-center">
            {formatCurrency(currentMonth.totalEntries)}
            <ArrowUpRight className="w-5 h-5 ml-2 opacity-50" />
          </h3>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-card rounded-2xl p-6 border border-border shadow-sm relative overflow-hidden group">
           <div className="absolute -right-6 -top-6 w-24 h-24 bg-destructive/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-destructive/10 text-destructive rounded-xl">
              <TrendingDown className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold px-2 py-1 bg-secondary text-muted-foreground rounded-full">Mês Atual</span>
          </div>
          <p className="text-muted-foreground text-sm mb-1">Saídas do Mês</p>
          <h3 className="text-3xl font-display font-bold text-destructive flex items-center">
            {formatCurrency(currentMonth.totalExpenses)}
            <ArrowDownRight className="w-5 h-5 ml-2 opacity-50" />
          </h3>
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 bg-card rounded-3xl p-6 border border-border shadow-sm"
        >
          <h3 className="text-lg font-display font-bold mb-6">Receitas vs Despesas (12 Meses)</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(val) => `R$ ${val / 1000}k`}
                />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  formatter={(value: any) => formatCurrency(value)}
                  labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--foreground))', marginBottom: '8px' }}
                />
                <Line type="monotone" name="Entradas" dataKey="totalEntries" stroke="hsl(var(--success))" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" name="Saídas" dataKey="totalExpenses" stroke="hsl(var(--destructive))" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card rounded-3xl p-6 border border-border shadow-sm flex flex-col"
        >
          <h3 className="text-lg font-display font-bold mb-6">Top 5 Categorias de Despesa</h3>
          {topExpenseCategories.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Nenhuma despesa registrada.
            </div>
          ) : (
            <div className="h-[250px] w-full mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topExpenseCategories} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="category" type="category" hide />
                  <RechartsTooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={24}>
                    {topExpenseCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(var(--destructive) / ${1 - index * 0.15})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          
          <div className="space-y-3 mt-auto">
            {topExpenseCategories.map((cat, i) => (
              <div key={cat.category} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(var(--destructive) / ${1 - i * 0.15})` }}></div>
                  <span className="capitalize font-medium text-muted-foreground">{cat.category}</span>
                </div>
                <span className="font-semibold text-foreground">{formatCurrency(cat.total)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
