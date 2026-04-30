import { useGetPlanningSummary } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useLocation } from "wouter";
import {
  Target, AlertTriangle, Loader2, ArrowRight, CheckCircle2, Clock,
  TrendingUp, UserX, Calendar, DollarSign,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line, CartesianGrid,
} from "recharts";

function formatCurrency(v: string | number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    typeof v === "string" ? parseFloat(v || "0") : v,
  );
}

const STATUS_LABELS: Record<string, string> = {
  planejada: "Planejada", aprovada: "Aprovada", em_andamento: "Em Andamento",
  concluida: "Concluída", cancelada: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  planejada: "#94a3b8", aprovada: "#3b82f6", em_andamento: "#f59e0b",
  concluida: "#10b981", cancelada: "#ef4444",
};

const TYPE_LABELS: Record<string, string> = {
  aquisicao: "Aquisição", reforma: "Reforma", campanha: "Campanha",
  evento_especial: "Evento Especial", capacitacao: "Capacitação",
  missoes: "Missões", administrativo: "Administrativo", outro: "Outro",
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: "bg-red-100 text-red-800",
  media: "bg-yellow-100 text-yellow-800",
  baixa: "bg-slate-100 text-slate-800",
};

const PRIORITY_LABELS: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

function formatMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function daysUntil(d: string): number {
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export default function PlanningDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data, isLoading } = useGetPlanningSummary();
  const summary = data as any;

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Planejamento" }]}>
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const planned = parseFloat(summary?.totalPlannedBudget || "0");
  const realized = parseFloat(summary?.totalRealizedCost || "0");
  const budgetUsage = planned > 0 ? Math.min(100, Math.round((realized / planned) * 100)) : 0;
  const budgetOverrun = planned > 0 && realized > planned;

  const statusData = Object.entries((summary?.byStatus || {}) as Record<string, number>)
    .map(([key, value]) => ({ name: STATUS_LABELS[key] || key, value, key }));

  const typeData = Object.entries((summary?.byType || {}) as Record<string, number>)
    .map(([key, value]) => ({ name: TYPE_LABELS[key] || key, value }))
    .sort((a, b) => b.value - a.value);

  const budgetByType = ((summary?.byTypeBudget || []) as Array<any>)
    .map(b => ({ name: TYPE_LABELS[b.type] || b.type, planejado: parseFloat(b.planned), realizado: parseFloat(b.realized) }))
    .filter(b => b.planejado > 0 || b.realizado > 0)
    .sort((a, b) => b.planejado - a.planejado);

  const monthlyData = ((summary?.monthly || []) as Array<any>).map(m => ({
    month: formatMonth(m.month),
    Criadas: m.created,
    Concluídas: m.completed,
  }));

  return (
    <AppLayout breadcrumbs={[{ label: "Planejamento" }]}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" /> Planejamento Estratégico
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setLocation("/planning/directives")} className="px-4 py-2 border rounded-xl text-sm hover:bg-secondary">Diretrizes</button>
          <button onClick={() => setLocation("/planning/initiatives")} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90">Iniciativas</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label="Total / Ativas"
          primary={`${summary?.totalInitiatives || 0}`}
          secondary={`${summary?.activeInitiatives || 0} ativas`}
          tone="default"
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Taxa de conclusão"
          primary={`${summary?.completionRate || 0}%`}
          secondary={`${summary?.completedInitiatives || 0} concluídas`}
          tone="success"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Atrasadas"
          primary={`${summary?.overdueInitiatives || 0}`}
          secondary={summary?.overdueInitiatives > 0 ? "Verifique prazos" : "Sob controle"}
          tone={summary?.overdueInitiatives > 0 ? "danger" : "success"}
          onClick={() => summary?.overdueInitiatives > 0 && setLocation("/planning/initiatives?status=atrasadas")}
        />
        <KpiCard
          icon={<Calendar className="h-4 w-4" />}
          label="Próximas 30 dias"
          primary={`${summary?.upcomingInitiatives || 0}`}
          secondary="A vencer"
          tone="warning"
        />
      </div>

      {/* Budget bar (admin) */}
      {isAdmin && planned > 0 && (
        <div className="rounded-2xl border bg-card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Utilização do orçamento
            </h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${budgetOverrun ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
              {budgetOverrun ? "Estourado" : `${budgetUsage}% usado`}
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${budgetOverrun ? "bg-red-500" : "bg-primary"}`}
              style={{ width: `${budgetOverrun ? 100 : budgetUsage}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span>Realizado: <strong className="text-foreground">{formatCurrency(realized)}</strong></span>
            <span>Planejado: <strong className="text-foreground">{formatCurrency(planned)}</strong></span>
          </div>
        </div>
      )}

      {/* Anomaly alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {summary?.overdueInitiatives > 0 && (
          <AlertCard
            icon={<AlertTriangle className="h-4 w-4" />}
            title={`${summary.overdueInitiatives} iniciativa(s) atrasada(s)`}
            description="Prazo passou e não foram concluídas"
            tone="danger"
            actionLabel="Ver iniciativas"
            onAction={() => setLocation("/planning/initiatives")}
          />
        )}
        {summary?.withoutResponsible > 0 && (
          <AlertCard
            icon={<UserX className="h-4 w-4" />}
            title={`${summary.withoutResponsible} sem responsável`}
            description="Iniciativas ativas sem alguém designado"
            tone="warning"
            actionLabel="Designar"
            onAction={() => setLocation("/planning/initiatives")}
          />
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Status pie */}
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Iniciativas por Status</h3>
          {statusData.length === 0 ? (
            <EmptyChart message="Nenhuma iniciativa cadastrada." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {statusData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Type bar */}
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Iniciativas por Tipo</h3>
          {typeData.length === 0 ? (
            <EmptyChart message="Nenhuma iniciativa cadastrada." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={typeData} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#00c6d7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Monthly evolution */}
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Evolução mensal (últimos 6 meses)
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend iconType="circle" />
              <Line type="monotone" dataKey="Criadas" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Concluídas" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Budget by type (admin only) */}
        {isAdmin && (
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-semibold mb-4">Orçado vs Realizado por Tipo</h3>
            {budgetByType.length === 0 ? (
              <EmptyChart message="Nenhum orçamento informado." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={budgetByType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  <Legend iconType="circle" />
                  <Bar dataKey="planejado" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="realizado" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Action Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Overdue */}
        {summary?.overdueTop?.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-card p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" /> Atrasadas (top 5)
            </h3>
            <div className="space-y-2">
              {(summary.overdueTop as any[]).map(i => (
                <InitiativeRow key={i.id} item={i} variant="overdue" onClick={() => setLocation("/planning/initiatives")} />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {summary?.upcomingTop?.length > 0 && (
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-amber-700">
              <Clock className="h-4 w-4" /> A vencer nos próximos 30 dias
            </h3>
            <div className="space-y-2">
              {(summary.upcomingTop as any[]).map(i => (
                <InitiativeRow key={i.id} item={i} variant="upcoming" onClick={() => setLocation("/planning/initiatives")} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Directives with progress */}
      {summary?.directivesProgress?.length > 0 && (
        <div className="rounded-2xl border bg-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Diretrizes Estratégicas</h3>
            <button onClick={() => setLocation("/planning/directives")} className="text-sm text-primary hover:underline flex items-center gap-1">
              Gerenciar <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-3">
            {(summary.directivesProgress as any[]).map(d => (
              <div key={d.id} className="rounded-xl bg-muted/40 p-4 cursor-pointer hover:bg-muted/70 transition-colors" onClick={() => setLocation("/planning/directives")}>
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.startYear} — {d.endYear}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    d.status === "ativa" ? "bg-green-100 text-green-800"
                      : d.status === "concluida" ? "bg-blue-100 text-blue-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {d.status === "ativa" ? "Ativa" : d.status === "concluida" ? "Concluída" : "Cancelada"}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{d.completedInitiatives} de {d.totalInitiatives} iniciativas concluídas</span>
                  <span className="font-medium text-foreground">{d.progress}%</span>
                </div>
                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${d.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, primary, secondary, tone, onClick }: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  tone?: "default" | "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const toneClasses = {
    default: "text-foreground",
    success: "text-green-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  } as const;
  const cls = toneClasses[tone || "default"];

  return (
    <div
      className={`rounded-2xl border bg-card p-4 ${onClick ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <p className={`text-2xl font-bold ${cls}`}>{primary}</p>
      {secondary && <p className="text-xs text-muted-foreground mt-0.5">{secondary}</p>}
    </div>
  );
}

function AlertCard({ icon, title, description, tone, actionLabel, onAction }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone: "danger" | "warning";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const cls = tone === "danger"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${cls}`}>
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs opacity-80">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button onClick={onAction} className="text-xs font-medium hover:underline shrink-0">
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

function InitiativeRow({ item, variant, onClick }: { item: any; variant: "overdue" | "upcoming"; onClick: () => void }) {
  const days = item.endDate ? daysUntil(item.endDate) : 0;
  const dateLabel = variant === "overdue"
    ? `${Math.abs(days)} dia(s) atrás`
    : days === 0 ? "Hoje" : `Em ${days} dia(s)`;
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {item.responsibleName || "Sem responsável"} · {TYPE_LABELS[item.type] || item.type}
        </p>
      </div>
      <div className="text-right shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[item.priority] || ""}`}>
          {PRIORITY_LABELS[item.priority] || item.priority}
        </span>
        <p className={`text-xs mt-1 ${variant === "overdue" ? "text-red-600 font-medium" : "text-amber-600"}`}>
          {dateLabel}
        </p>
      </div>
    </button>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}
