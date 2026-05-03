import { useState } from "react";
import { useListCultos } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BookMarked, Plus, Filter, Loader2, Wine, Droplets, UserPlus, Music, BarChart3,
} from "lucide-react";

export default function CultosListPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "leader";

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<string>("");
  const [hasCommunion, setHasCommunion] = useState(false);
  const [hasBaptism, setHasBaptism] = useState(false);

  const { data, isLoading } = useListCultos({
    year,
    ...(month ? { month: parseInt(month) } : {}),
    ...(hasCommunion ? { hasCommunion: true } : {}),
    ...(hasBaptism ? { hasBaptism: true } : {}),
    limit: 100,
  } as any);

  const cultos = ((data as any)?.cultos ?? []) as any[];

  return (
    <AppLayout breadcrumbs={[{ label: "Cultos" }]}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookMarked className="h-6 w-6 text-primary" /> Cultos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agenda anual de cultos da igreja
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link
              href="/cultos/reports"
              className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted"
            >
              <BarChart3 className="h-4 w-4" /> Relatório Anual
            </Link>
          )}
          {canEdit && (
            <Link
              href="/cultos/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Novo Culto
            </Link>
          )}
        </div>
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
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todos os meses</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString("pt-BR", { month: "long" })}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer px-3 py-2 border rounded-lg hover:bg-muted">
            <input type="checkbox" checked={hasCommunion} onChange={(e) => setHasCommunion(e.target.checked)} />
            <Wine className="h-3.5 w-3.5 text-purple-600" /> Com Ceia
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer px-3 py-2 border rounded-lg hover:bg-muted">
            <input type="checkbox" checked={hasBaptism} onChange={(e) => setHasBaptism(e.target.checked)} />
            <Droplets className="h-3.5 w-3.5 text-blue-600" /> Com Batismo
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : cultos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-2xl">
          <BookMarked className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Nenhum culto encontrado.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-center">Elementos</th>
                <th className="px-4 py-3 text-center">Músicas</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cultos.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/cultos/${c.id}`} className="text-primary hover:underline">
                      {format(new Date(c.startDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.title}</p>
                    {c.location && <p className="text-xs text-muted-foreground">{c.location}</p>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      {c.hasCommunion && <Wine className="h-4 w-4 text-purple-600" />}
                      {c.hasBaptism && <Droplets className="h-4 w-4 text-blue-600" />}
                      {c.hasMemberReception && <UserPlus className="h-4 w-4 text-emerald-600" />}
                      {!c.hasCommunion && !c.hasBaptism && !c.hasMemberReception && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Music className="h-3.5 w-3.5" /> {c.songCount ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                      {c.status}
                    </span>
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
