import { useState } from "react";
import { useGetMyData, useExportMyData, useCreateLgpdRequest, useGetMyLgpdRequests } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield, Download, FileEdit, Trash2, XCircle,
  Loader2, AlertTriangle, CheckCircle, Clock, Info
} from "lucide-react";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  correcao: "Correção de dados",
  exclusao: "Exclusão de dados",
  exportacao: "Exportação de dados",
  revogacao_consentimento: "Revogação de consentimento",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em Análise",
  concluido: "Concluído",
  rejeitado: "Rejeitado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "text-amber-600",
  em_analise: "text-blue-600",
  concluido: "text-green-600",
  rejeitado: "text-red-600",
};

const CONSENT_TYPE_LABELS: Record<string, string> = {
  lgpd_member_registration: "Registro de membro (LGPD)",
  lgpd_csv_import: "Importação CSV (LGPD)",
  terms_of_service: "Termos de serviço",
};

export default function MyDataPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState("");
  const [requestDescription, setRequestDescription] = useState("");

  const { data, isLoading, isError } = useGetMyData();

  const createRequest = useCreateLgpdRequest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/lgpd"] });
        toast({ title: "Sucesso", description: "Solicitação enviada. Prazo de resposta: 15 dias." });
        setShowRequestModal(false);
        setRequestType("");
        setRequestDescription("");
      },
      onError: () => toast({ title: "Erro", description: "Falha ao criar solicitação.", variant: "destructive" }),
    },
  });

  function handleExport() {
    // Trigger download by opening the export URL
    window.open("/api/lgpd/my-data/export", "_blank");
    toast({ title: "Exportação iniciada", description: "Seus dados estão sendo baixados em formato JSON." });
  }

  function openRequest(type: string) {
    setRequestType(type);
    setRequestDescription("");
    setShowRequestModal(true);
  }

  function submitRequest() {
    if (!requestType) return;
    createRequest.mutate({ data: { requestType, description: requestDescription || undefined } });
  }

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "LGPD", href: "/lgpd" }, { label: "Meus Dados" }]}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "LGPD", href: "/lgpd" }, { label: "Meus Dados" }]}>
        <div className="text-center py-12 text-destructive">Erro ao carregar seus dados.</div>
      </AppLayout>
    );
  }

  const member = data.member as Record<string, unknown>;
  const consents = (data.consents || []) as Array<Record<string, unknown>>;
  const requests = (data.requests || []) as Array<Record<string, unknown>>;

  return (
    <AppLayout breadcrumbs={[{ label: "LGPD", href: "/lgpd" }, { label: "Meus Dados" }]}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-500" /> Meus Dados Pessoais
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conforme a LGPD (Lei 13.709/2018), você tem direito de acessar, corrigir, exportar e solicitar a exclusão dos seus dados.
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <button onClick={handleExport} className="flex items-center gap-2 p-3 rounded-xl border hover:bg-muted transition-colors text-sm">
          <Download className="h-4 w-4 text-blue-500" /> Exportar Dados
        </button>
        <button onClick={() => openRequest("correcao")} className="flex items-center gap-2 p-3 rounded-xl border hover:bg-muted transition-colors text-sm">
          <FileEdit className="h-4 w-4 text-amber-500" /> Solicitar Correção
        </button>
        <button onClick={() => openRequest("exclusao")} className="flex items-center gap-2 p-3 rounded-xl border hover:bg-destructive/10 transition-colors text-sm text-destructive">
          <Trash2 className="h-4 w-4" /> Solicitar Exclusão
        </button>
        <button onClick={() => openRequest("revogacao_consentimento")} className="flex items-center gap-2 p-3 rounded-xl border hover:bg-muted transition-colors text-sm">
          <XCircle className="h-4 w-4 text-orange-500" /> Revogar Consentimento
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Personal Data */}
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Dados Pessoais</h2>
          <div className="space-y-3 text-sm">
            {[
              ["Nome", member.fullName],
              ["CPF", member.cpfMasked || "Não informado"],
              ["Data de Nascimento", member.dateOfBirth || "—"],
              ["Sexo", member.sex || "—"],
              ["Telefone", member.phone || "—"],
              ["Email", member.email || "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value as string}</span>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-semibold mt-6 mb-3">Endereço</h3>
          <div className="space-y-3 text-sm">
            {[
              ["CEP", member.addressZip || "—"],
              ["Rua", member.addressStreet || "—"],
              ["Número", member.addressNumber || "—"],
              ["Bairro", member.addressNeighborhood || "—"],
              ["Cidade", member.addressCity || "—"],
              ["Estado", member.addressState || "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value as string}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Consents & Requests */}
        <div className="space-y-8">
          {/* Consents */}
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Consentimentos Dados</h2>
            {consents.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum consentimento registrado.</p>
            ) : (
              <div className="space-y-2">
                {consents.map((c) => (
                  <div key={c.id as string} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 text-sm">
                    <div>
                      <p className="font-medium">{CONSENT_TYPE_LABELS[(c.consentType as string)] || c.consentType}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.createdAt as string).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 ${c.accepted ? "text-green-600" : "text-red-600"}`}>
                      {c.accepted ? <><CheckCircle className="h-4 w-4" /> Aceito</> : <><XCircle className="h-4 w-4" /> Recusado</>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Requests */}
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Minhas Solicitações</h2>
            {requests.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma solicitação registrada.</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => (
                  <div key={r.id as string} className="p-3 rounded-xl bg-muted/50 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{REQUEST_TYPE_LABELS[(r.requestType as string)] || r.requestType}</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[(r.status as string)] || ""}`}>
                        <Clock className="h-3 w-3" /> {STATUS_LABELS[(r.status as string)] || r.status}
                      </span>
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground">{r.description as string}</p>}
                    {r.adminNotes && (
                      <p className="text-xs mt-1 p-2 bg-background rounded">
                        <strong>Resposta:</strong> {r.adminNotes as string}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Criado em {new Date(r.createdAt as string).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRequestModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">{REQUEST_TYPE_LABELS[requestType] || "Nova Solicitação"}</h2>
            </div>
            <div className="p-6 space-y-4">
              {requestType === "exclusao" && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive">Atenção: esta ação é irreversível</p>
                      <p className="text-muted-foreground mt-1">
                        Ao solicitar a exclusão, seus dados pessoais serão anonimizados.
                        Registros financeiros serão mantidos por obrigação fiscal (5 anos),
                        mas sem vínculo com seu nome. Sua conta será desativada.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {requestType === "revogacao_consentimento" && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-amber-600 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Revogar o consentimento pode impedir o uso de funcionalidades do sistema.
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Descrição (opcional)</label>
                <textarea
                  value={requestDescription}
                  onChange={e => setRequestDescription(e.target.value)}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  placeholder={requestType === "correcao" ? "Descreva o que precisa ser corrigido..." : "Observações adicionais..."}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Prazo legal para resposta: <strong>15 dias</strong> (Lei 13.709/2018, Art. 18).
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => setShowRequestModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button
                  onClick={submitRequest}
                  disabled={createRequest.isPending}
                  className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${
                    requestType === "exclusao"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-primary text-primary-foreground"
                  } disabled:opacity-50`}
                >
                  {createRequest.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar Solicitação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
