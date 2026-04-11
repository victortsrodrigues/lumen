import { useState } from 'react';
import { useGetAuditLogs } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ShieldAlert, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-context';
import { Redirect } from 'wouter';

export default function AuditLogs() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const limit = 15;

  const { data, isLoading, isError } = useGetAuditLogs({
    page,
    limit,
  }, {
    query: {
      enabled: user?.role === 'admin'
    }
  });

  if (user && user.role !== 'admin') {
    return <Redirect to="/" />;
  }

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <AppLayout breadcrumbs={[{ label: "Logs de Auditoria" }]}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Registro de Atividades</h2>
          <p className="text-muted-foreground mt-1">Trilha de auditoria imutável (Append-only) de todas as ações no sistema.</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Buscar logs..." 
            className="pl-9 pr-4 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-full sm:w-64 transition-all"
            disabled
            title="Busca será implementada em breve"
          />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/50 border-b border-border text-muted-foreground font-medium uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Data e Hora</th>
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Ação</th>
                <th className="px-6 py-4">Recurso</th>
                <th className="px-6 py-4">Endereço IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                    <span className="text-muted-foreground">Carregando logs...</span>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-destructive">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span className="font-medium">Erro ao carregar auditoria</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-foreground font-medium">
                      {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss", { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {log.userId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {log.resourceType || '-'} {log.resourceId ? `(#${log.resourceId.substring(0,8)}...)` : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                      {log.ipAddress || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!isLoading && totalPages > 0 && (
          <div className="px-6 py-4 border-t border-border bg-secondary/20 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Mostrando página <span className="font-medium text-foreground">{page}</span> de <span className="font-medium text-foreground">{totalPages}</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
