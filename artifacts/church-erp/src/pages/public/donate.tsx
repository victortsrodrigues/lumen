import { useState } from "react";
import { useGetPixDonateInfo, useCreatePixDonation } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Loader2, Copy, Check, Heart } from "lucide-react";

export default function DonatePage() {
  const { data: pixInfo, isLoading: loadingInfo } = useGetPixDonateInfo();
  const createDonation = useCreatePixDonation();

  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [result, setResult] = useState<{ txId: string; pixPayload: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    try {
      const res = await createDonation.mutateAsync({
        data: {
          amount: Number(amount),
          ...(donorName ? { donorName } : {}),
          ...(donorEmail ? { donorEmail } : {}),
        },
      });
      setResult({ txId: res.txId, pixPayload: res.pixPayload });
    } catch {
      // error handled by mutation state
    }
  };

  const handleCopy = async () => {
    if (!result?.pixPayload) return;
    try {
      await navigator.clipboard.writeText(result.pixPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const resetForm = () => {
    setResult(null);
    setAmount("");
    setDonorName("");
    setDonorEmail("");
    setCopied(false);
  };

  if (loadingInfo) {
    return (
      <PublicLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Heart className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Contribuir via PIX</h1>
          {pixInfo && (
            <p className="text-muted-foreground">
              {pixInfo.churchName}
              {pixInfo.pixKey && (
                <span className="block text-sm mt-1">
                  Chave PIX: <span className="font-mono">{pixInfo.pixKey}</span>
                </span>
              )}
            </p>
          )}
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Valor (R$) <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border bg-background px-4 py-2.5 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Seu nome <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <input
                type="text"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                placeholder="Nome completo"
                className="w-full rounded-lg border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Seu e-mail <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <input
                type="email"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full rounded-lg border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={createDonation.isPending || !amount}
              className="w-full rounded-lg bg-primary text-primary-foreground py-3 font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {createDonation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando PIX...
                </>
              ) : (
                "Gerar codigo PIX"
              )}
            </button>

            {createDonation.isError && (
              <p className="text-sm text-destructive text-center">
                Erro ao gerar o PIX. Tente novamente.
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Transacao</p>
                <p className="font-mono text-xs break-all">{result.txId}</p>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2 text-center">
                  Copie o codigo PIX e cole no seu app de banco
                </p>
                <div className="relative">
                  <div className="rounded-lg bg-muted p-4 font-mono text-xs break-all select-all leading-relaxed">
                    {result.pixPayload}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 p-2 rounded-md bg-background border hover:bg-accent transition-colors"
                    title="Copiar"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={resetForm}
              className="w-full rounded-lg border py-2.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              Fazer nova contribuicao
            </button>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
