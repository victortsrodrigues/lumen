import { useState } from "react";
import { useListLgpdRequests, useProcessLgpdRequest } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Filter, Loader2, X, CheckCircle,
  XCircle, AlertTriangle, Clock
} from "lucide-react";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  correcao: "Correção",
  exclusao: "Exclusão",
  exportacao: "Exportação",
  revogacao_consentimento: "Revogação",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em Análise",
  concluido: "Concluído",
  rejeitado: "Rejeitado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  em_analise: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  concluido: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejeitado: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function daysRemaining(createdAt: string): number {
  const created = new Date(createdAt);
  const deadline = new Date(created.getTime() + 15 * 24 * 60 * 60 * 1000);
  const now = new Date();
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export default function AdminRequestsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pendente");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processAction, setProcessAction] = useState<"concluido" | "rejeitado" | "">("");
  const [adminNotes, setAdminNotes] = useState("");

  const { data, isLoading } = useListLgpdRequests({
    page, limit: 20,
    ...(statusFilter ? { status: statusFilter } : {}),
  });

  const processMutation = useProcessLgpdRequest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/lgpd"] });
        toast({ title: "Sucesso", description: "Solicitação processada." });
        closeProcessModal();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Falha ao processar.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  function openProcess(id: string, action: "concluido" | "rejeitado") {
    setProcessingId(id);
    setProcessAction(action);
    setAdminNotes("");
  }

  function closeProcessModal() {
    setProcessingId(null);
    setProcessAction("");
    setAdminNotes("");
  }

  function handleProcess() {
    if (!processingId || !processAction) return;
    if (processAction === "rejeitado" && !adminNotes.trim()) {
      toast({ title: "Atenção", description: "Justificativa é obrigatória ao rejeitar.", variant: "destructive" });
      return;
    }
    processMutation.mutate({
      id: processingId,
      data: { status: processAction, adminNotes: adminNotes || undefined },
    });
  }

  const requests = data?.requests || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  // Find the request being processed for context in the modal
  const processingRequest = requests.find((r: Record<string, unknown>) => r.id === processingId) as Record<string, unknown> | undefined;

  return (
    <AppLayout breadcrumbs={[{ label: "LGPD", href: "/lgpd" }, { label: "Solicitações" }]}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-500" /> Solicitações LGPD
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie solicitações de titulares de dados. Prazo legal: 15 dias para resposta.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground mt-2" />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg bg-background text-sm">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {statusFilter && (
          <button onClick={() => { setStatusFilter(""); setPage(1); }} className="text-xs text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
        <span className="text-sm text-muted-foreground mt-2">{total} solicitação(ões)</span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      )}

      {!isLoading && (
        <div className="space-y-4">
          {requests.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Nenhuma solicitação encontrada.</div>
          )}
          {requests.map((r: Record<string, unknown>) => {
            const days = daysRemaining(r.createdAt as string);
            const isOverdue = days === 0 && r.status === "pendente";

            return (
              <div key={r.id as string} className={`rounded-2xl border bg-card p-6 ${isOverdue ? "border-destructive/50" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[(r.status as string)] || ""}`}>
                        {STATUS_LABELS[(r.status as string)] || r.status}
                      </span>
                      <span className="text-sm font-medium">
                        {REQUEST_TYPE_LABELS[(r.requestType as string)] || r.requestType}
                      </span>
                      {r.status === "pendente" && (
                        <span className={`flex items-center gap-1 text-xs ${isOverdue ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" />
                          {isOverdue ? "PRAZO EXPIRADO" : `${days} dia(s) restante(s)`}
                        </span>
                      )}
                    </div>
                    <p className="font-medium">{(r.memberName as string) || "Membro"}</p>
                    {r.description && <p className="text-sm text-muted-foreground mt-1">{r.description as string}</p>}
                    <p className="text-xs text-muted-foreground mt-2">
                      Criado em {new Date(r.createdAt as string).toLocaleDateString("pt-BR")}
                      {r.processedAt && ` — Processado em ${new Date(r.processedAt as string).toLocaleDateString("pt-BR")}`}
                    </p>
                    {r.adminNotes && (
                      <p className="text-sm mt-2 p-2 bg-muted rounded-lg">
                        <strong>Notas:</strong> {r.adminNotes as string}
                      </p>
                    )}
                  </div>

                  {(r.status === "pendente" || r.status === "em_analise") && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openProcess(r.id as string, "concluido")}
                        className="flex items-center gap-1 px-3 py-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-lg text-sm hover:opacity-80"
                      >
                        <CheckCircle className="h-4 w-4" /> Aprovar
                      </button>
                      <button
                        onClick={() => openProcess(r.id as string, "rejeitado")}
                        className="flex items-center gap-1 px-3 py-2 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-sm hover:opacity-80"
                      >
                        <XCircle className="h-4 w-4" /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50">Anterior</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50">Próxima</button>
          </div>
        </div>
      )}

      {/* Process Modal */}
      {processingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeProcessModal}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">
                {processAction === "concluido" ? "Aprovar Solicitação" : "Rejeitar Solicitação"}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {processAction === "concluido" && processingRequest?.requestType === "exclusao" && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive">Ação irreversível</p>
                      <p className="text-muted-foreground mt-1">
                        Ao aprovar a exclusão, os dados pessoais de <strong>{(processingRequest.memberName as string) || "Membro"}</strong> serão
                        anonimizados. Registros financeiros serão mantidos sem vínculo com o nome.
                        A conta será desativada.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">
                  {processAction === "rejeitado" ? "Justificativa (obrigatória) *" : "Notas (opcional)"}
                </label>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  placeholder={processAction === "rejeitado" ? "Explique o motivo da rejeição..." : "Observações sobre o processamento..."}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={closeProcessModal} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button
                  onClick={handleProcess}
                  disabled={processMutation.isPending}
                  className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 ${
                    processAction === "concluido"
                      ? "bg-green-600 text-white"
                      : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  {processMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {processAction === "concluido" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
