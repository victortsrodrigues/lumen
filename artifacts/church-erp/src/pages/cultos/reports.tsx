import { useState } from "react";
import { useGetAnnualCultoReport } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link, Redirect } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart3, BookMarked, Wine, Droplets, UserPlus, Loader2, Users, ClipboardCheck,
} from "lucide-react";

export default function CultosReportsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "leader";

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useGetAnnualCultoReport({ year } as any, {
    query: { enabled: canEdit },
  });

  if (!canEdit) return <Redirect to="/cultos" />;

  const report = data as any;

  return (
    <AppLayout breadcrumbs={[{ label: "Cultos", href: "/cultos" }, { label: "Relatório Anual" }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Relatório Anual de Cultos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Visão consolidada do ano</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg bg-background text-sm"
        >
          {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {isLoading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi icon={<BookMarked className="h-5 w-5" />} label="Cultos" value={report.totals?.cultos ?? 0} color="text-primary" />
            <Kpi icon={<Wine className="h-5 w-5" />} label="Ceias" value={report.totals?.communions ?? 0} color="text-purple-600" />
            <Kpi icon={<Droplets className="h-5 w-5" />} label="Batismos" value={report.totals?.baptisms ?? 0} color="text-blue-600" />
            <Kpi icon={<UserPlus className="h-5 w-5" />} label="Recepções" value={report.totals?.memberReceptions ?? 0} color="text-emerald-600" />
          </div>

          {/* Tabela */}
          <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Título</th>
                  <th className="px-4 py-3 text-center">Elementos</th>
                  <th className="px-4 py-3 text-center"><Users className="h-3.5 w-3.5 inline" /> Presentes</th>
                  <th className="px-4 py-3 text-center"><ClipboardCheck className="h-3.5 w-3.5 inline" /> Escalados</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(report.items ?? []).map((c: any) => (
                  <tr key={c.cultoId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/cultos/${c.cultoId}`} className="text-primary hover:underline">
                        {format(new Date(c.startDate), "dd/MM/yyyy", { locale: ptBR })}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{c.title}</td>
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
                    <td className="px-4 py-3 text-center">{c.attendanceCount ?? 0}</td>
                    <td className="px-4 py-3 text-center">{c.scheduledCount ?? 0}</td>
                  </tr>
                ))}
                {(report.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhum culto registrado em {year}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppLayout>
  );
}

function Kpi({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-2xl border p-4">
      <div className={`flex items-center gap-2 ${color}`}>
        {icon}
        <span className="text-xs uppercase font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}
