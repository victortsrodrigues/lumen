import { useEffect, useState } from "react";
import { useListCouncilMeetings } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link, Redirect } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Gavel, Plus, Search, Filter, Loader2, FileText, ListTodo,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  agendada: "bg-blue-100 text-blue-700 border-blue-200",
  realizada: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelada: "bg-red-100 text-red-700 border-red-200",
};

export default function ConselhoListPage() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useListCouncilMeetings(
    {
      year,
      ...(status ? { status } : {}),
      ...(searchQuery ? { search: searchQuery } : {}),
      limit: 100,
    } as any,
    { query: { enabled: user?.role === "admin" } },
  );

  if (user?.role !== "admin") return <Redirect to="/" />;

  const meetings = ((data as any)?.meetings ?? []) as any[];

  return (
    <AppLayout breadcrumbs={[{ label: "Conselho" }]}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gavel className="h-6 w-6 text-primary" /> Conselho
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reuniões e atas do conselho da igreja
          </p>
        </div>
        <Link
          href="/conselho/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova Reunião
        </Link>
      </div>

      <div className="bg-card rounded-2xl border shadow-sm mb-6 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todos os status</option>
            <option value="agendada">Agendada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar em título, pauta ou resumo..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg bg-background text-sm"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-2xl">
          <Gavel className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Nenhuma reunião encontrada.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Itens</th>
                <th className="px-4 py-3 text-center">Ata</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {meetings.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/conselho/${m.id}`} className="text-primary hover:underline">
                      {format(new Date(m.meetingDate), "dd/MM/yyyy", { locale: ptBR })}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.title}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[m.status]}`}>
                      {STATUS_LABELS[m.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ListTodo className="h-3.5 w-3.5" /> {m.itemCount ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.ataMediaId ? (
                      <FileText className="h-4 w-4 text-primary inline" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
