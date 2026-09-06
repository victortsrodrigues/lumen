import { useState } from "react";
import {
  type CreateLgpdRequestBodyRequestType,
  type LgpdRequest,
  useGetMyData,
  useCreateLgpdRequest,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import {
  Shield, Download, FileEdit, XCircle,
  Loader2, CheckCircle, Clock, Info
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
  lgpd_member_registration: "Declaração no registro de membro",
  lgpd_csv_import: "Declaração na importação CSV",
  terms_of_service: "Aceite do cadastro anterior aos textos publicados",
  privacy_notice: "Ciência da Política de Privacidade",
};

function consentLabel(value: string): string {
  const [type, version] = value.split('@');
  if (type === 'terms_of_service' && version) return `Termos de Uso · versão ${version}`;
  const label = CONSENT_TYPE_LABELS[type] || type;
  return version ? `${label} · versão ${version}` : label;
}

export default function MyDataPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<CreateLgpdRequestBodyRequestType | "">("");
  const [requestDescription, setRequestDescription] = useState("");

  const { data, isLoading, isError } = useGetMyData();

  const createRequest = useCreateLgpdRequest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/lgpd"] });
        toast({ title: "Sucesso", description: "Solicitação enviada. Acompanhe a resposta nesta página." });
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

  function openRequest(type: CreateLgpdRequestBodyRequestType) {
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
  const requests = (data.requests || []) as LgpdRequest[];

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <button onClick={handleExport} className="flex items-center gap-2 p-3 rounded-xl border hover:bg-muted transition-colors text-sm">
          <Download className="h-4 w-4 text-blue-500" /> Exportar Dados
        </button>
        <button onClick={() => openRequest("correcao")} className="flex items-center gap-2 p-3 rounded-xl border hover:bg-muted transition-colors text-sm">
          <FileEdit className="h-4 w-4 text-amber-500" /> Solicitar Correção
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
                <span className="text-muted-foreground">{String(label)}</span>
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
                <span className="text-muted-foreground">{String(label)}</span>
                <span className="font-medium">{value as string}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Consents & Requests */}
        <div className="space-y-8">
          {/* Consents */}
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Aceites e declarações</h2>
            {consents.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum registro encontrado.</p>
            ) : (
              <div className="space-y-2">
                {consents.map((c) => (
                  <div key={c.id as string} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 text-sm">
                    <div>
                      <p className="font-medium">{consentLabel(String(c.consentType))}</p>
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
                      <span className="font-medium">{REQUEST_TYPE_LABELS[r.requestType] || r.requestType}</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[r.status] || ""}`}>
                        <Clock className="h-3 w-3" /> {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                    {r.adminNotes && (
                      <p className="text-xs mt-1 p-2 bg-background rounded">
                        <strong>Resposta:</strong> {r.adminNotes}
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

      <DeleteAccountSection />

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRequestModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">{REQUEST_TYPE_LABELS[requestType] || "Nova Solicitação"}</h2>
            </div>
            <div className="p-6 space-y-4">
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
                  className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-primary text-primary-foreground disabled:opacity-50"
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
