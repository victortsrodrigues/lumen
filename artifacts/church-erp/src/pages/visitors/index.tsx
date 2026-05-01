import { useState } from "react";
import { useListVisitors, useGetVisitorsSummary } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link, Redirect } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UserPlus, Plus, Search, Loader2, Calendar, User, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  recente: "Recente",
  acompanhando: "Acompanhando",
  sem_retorno: "Sem retorno",
  nao_interessado: "Não interessado",
};

const STATUS_COLORS: Record<string, string> = {
  recente: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  acompanhando: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  sem_retorno: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  nao_interessado: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function VisitorsList() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useListVisitors({
    page: 1, limit: 60,
    ...(search ? { search } : {}),
    ...(statusFilter ? { status: statusFilter as any } : {}),
  });
  const { data: summary } = useGetVisitorsSummary();

  if (user?.role === "member") return <Redirect to="/" />;

  const visitors = (data?.visitors || []) as any[];

  return (
    <AppLayout breadcrumbs={[{ label: "Visitantes" }]}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-primary" /> Visitantes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cadastre e acompanhe pessoas que visitam a igreja antes de se tornarem membros.
          </p>
        </div>
        <Link href="/visitors/new" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo Visitante
        </Link>
      </div>

      {/* KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Kpi label="Total" value={(summary as any).total || 0} icon={<UserPlus className="h-4 w-4" />} />
          <Kpi label="Novos esta semana" value={(summary as any).newThisWeek || 0} icon={<Calendar className="h-4 w-4" />} tone="blue" />
          <Kpi label="Acompanhando" value={(summary as any).byStatus?.acompanhando || 0} icon={<User className="h-4 w-4" />} tone="amber" />
          <Kpi label="Convertidos (30d)" value={(summary as any).convertedLast30d || 0} icon={<TrendingUp className="h-4 w-4" />} tone="green" />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-xl bg-background text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-xl bg-background text-sm"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && visitors.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum visitante cadastrado.</p>
        </div>
      )}

      {!isLoading && visitors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visitors.map((v) => (
            <Link key={v.id} href={`/visitors/${v.id}`} className="block">
              <div className="rounded-2xl border bg-card p-5 hover:shadow-md transition-shadow h-full flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold truncate">{v.fullName}</h3>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", STATUS_COLORS[v.status] || "")}>
                    {STATUS_LABELS[v.status] || v.status}
                  </span>
                </div>
                {v.firstVisitDate && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Calendar className="h-3 w-3" /> Primeira visita: {format(new Date(v.firstVisitDate), "dd/MM/yyyy")}
                  </p>
                )}
                {v.assignedToMemberName && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <User className="h-3 w-3" /> Acompanha: {v.assignedToMemberName}
                  </p>
                )}
                <div className="mt-auto pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span>{v.totalVisits} visita{v.totalVisits === 1 ? "" : "s"}</span>
                  {v.howFoundUs && <span className="truncate ml-2">{v.howFoundUs}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

function Kpi({ label, value, icon, tone = "default" }: { label: string; value: number; icon: React.ReactNode; tone?: "default" | "blue" | "amber" | "green" }) {
  const toneClass = {
    default: "text-foreground",
    blue: "text-blue-600",
    amber: "text-amber-600",
    green: "text-green-600",
  }[tone];
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <p className={cn("text-2xl font-bold", toneClass)}>{value}</p>
    </div>
  );
}
