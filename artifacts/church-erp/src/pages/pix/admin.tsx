import { useState } from "react";
import {
  useListPixDonations, useGetPixConfig, useCreatePixConfig, useConfirmPixDonation, useCancelPixDonation,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect } from "wouter";
import {
  QrCode, Plus, Loader2, X, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", confirmado: "Confirmado", expirado: "Expirado", cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800",
  confirmado: "bg-green-100 text-green-800",
  expirado: "bg-slate-100 text-slate-800",
  cancelado: "bg-red-100 text-red-800",
};

export default function PixAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({ pixKey: "", pixKeyType: "cnpj", recipientName: "", city: "", institution: "", qrCodeImageUrl: "" });
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const { data: config } = useGetPixConfig();
  const { data: donations, isLoading } = useListPixDonations({
    page, limit: 20,
    ...(filterStatus ? { status: filterStatus as any } : {}),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/pix") });
  };

  const createConfigMutation = useCreatePixConfig({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Configuração PIX salva." }); setShowConfigModal(false); },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha.", variant: "destructive" }); },
    },
  });

  const confirmMutation = useConfirmPixDonation({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Doação confirmada." }); },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha.", variant: "destructive" }); },
    },
  });

  const cancelMutation = useCancelPixDonation({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Doação cancelada." }); },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha.", variant: "destructive" }); },
    },
  });

  const donationsList = donations?.donations || [];
  const total = donations?.total || 0;
  const totalPages = Math.ceil(total / 20);

  if (user?.role !== "admin") return <Redirect to="/" />;

  return (
    <AppLayout breadcrumbs={[{ label: "Financeiro", href: "/finance" }, { label: "PIX" }]}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <QrCode className="h-6 w-6" /> Contribuições PIX
        </h1>
        <button onClick={() => setShowConfigModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Configurar PIX
        </button>
      </div>

      {/* Current Config */}
      {config && (
        <div className="rounded-xl border bg-card p-4 mb-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Configuração Ativa</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground">Chave PIX</p><p className="font-medium">{config.pixKey}</p></div>
            <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">{config.pixKeyType}</p></div>
            <div><p className="text-muted-foreground">Beneficiário</p><p className="font-medium">{config.recipientName}</p></div>
            <div><p className="text-muted-foreground">Cidade</p><p className="font-medium">{config.city}</p></div>
            {(config as any).institution && (
              <div><p className="text-muted-foreground">Instituição</p><p className="font-medium">{(config as any).institution}</p></div>
            )}
            {(config as any).qrCodeImageUrl && (
              <div className="col-span-2 md:col-span-4">
                <p className="text-muted-foreground">QR Code</p>
                <img src={(config as any).qrCodeImageUrl} alt="QR PIX" className="w-40 h-40 object-contain mt-1 border rounded-lg" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Donations List */}
      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {!isLoading && donationsList.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <QrCode className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma doação registrada.</p>
        </div>
      )}

      {!isLoading && donationsList.length > 0 && (
        <div className="space-y-3">
          {donationsList.map((d: any) => (
            <div key={d.id} className="rounded-xl border bg-card p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">R$ {parseFloat(d.amount).toFixed(2)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.status] || ""}`}>
                    {STATUS_LABELS[d.status] || d.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {d.donorName || "Anônimo"} • TX: {d.txId} • {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              {d.status === "pendente" && (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmTarget(d.id)} className="p-2 hover:bg-green-50 rounded-lg" title="Confirmar">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </button>
                  <button onClick={() => cancelMutation.mutate({ id: d.id })} className="p-2 hover:bg-red-50 rounded-lg" title="Cancelar">
                    <XCircle className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`px-3 py-1 rounded-lg text-sm ${p === page ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Confirm Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-green-100"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
              <h3 className="font-semibold text-lg">Confirmar Doação</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">Confirma que o pagamento PIX foi recebido?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmTarget(null)} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">Cancelar</button>
              <button onClick={() => { confirmMutation.mutate({ id: confirmTarget }); setConfirmTarget(null); }}
                className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Configuração PIX</h3>
              <button onClick={() => setShowConfigModal(false)} className="p-2 hover:bg-muted rounded-lg"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createConfigMutation.mutate({ data: configForm as any }); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Chave PIX *</label>
                <input type="text" value={configForm.pixKey} onChange={(e) => setConfigForm(f => ({ ...f, pixKey: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipo da Chave *</label>
                <select value={configForm.pixKeyType} onChange={(e) => setConfigForm(f => ({ ...f, pixKeyType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                  <option value="cnpj">CNPJ</option>
                  <option value="cpf">CPF</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Aleatória</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome do Beneficiário *</label>
                <input type="text" value={configForm.recipientName} onChange={(e) => setConfigForm(f => ({ ...f, recipientName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cidade *</label>
                <input type="text" value={configForm.city} onChange={(e) => setConfigForm(f => ({ ...f, city: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Instituição <span className="text-muted-foreground text-xs">(opcional)</span></label>
                <input type="text" value={configForm.institution} onChange={(e) => setConfigForm(f => ({ ...f, institution: e.target.value }))} placeholder="Ex: CC CREDICAF LTDA" className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL da imagem do QR Code <span className="text-muted-foreground text-xs">(opcional)</span></label>
                <input type="url" value={configForm.qrCodeImageUrl} onChange={(e) => setConfigForm(f => ({ ...f, qrCodeImageUrl: e.target.value }))} placeholder="https://..." className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                <p className="text-xs text-muted-foreground mt-1">Cole a URL de uma imagem do QR code do PIX. Será exibida aos membros.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowConfigModal(false)} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">Cancelar</button>
                <button type="submit" disabled={createConfigMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50">
                  {createConfigMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
