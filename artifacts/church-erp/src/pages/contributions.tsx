import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect } from "wouter";
import { Loader2, Copy, Check, QrCode, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PixInfo {
  pixKey: string;
  pixKeyType: string;
  recipientName: string;
  city: string;
  institution: string | null;
  qrCodeImageUrl: string | null;
}

export default function ContributionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [info, setInfo] = useState<PixInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/pix/info", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error || "Não foi possível carregar as informações PIX.");
        }
        return r.json();
      })
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCopy = async () => {
    if (!info?.pixKey) return;
    try {
      await navigator.clipboard.writeText(info.pixKey);
      setCopied(true);
      toast({ title: "Chave copiada", description: "Cole no seu app de banco." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (user?.role === "admin") return <Redirect to="/finance/pix" />;

  return (
    <AppLayout breadcrumbs={[{ label: "Contribuições" }]}>
      <div className="max-w-xl mx-auto">
        <div className="text-center space-y-2 mb-8">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Heart className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Contribuições</h1>
          <p className="text-muted-foreground text-sm">
            Contribua com a obra através do PIX.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!loading && info && (
          <div className="space-y-6">
            {/* QR code */}
            <div className="rounded-2xl border bg-card p-6 flex flex-col items-center">
              {info.qrCodeImageUrl ? (
                <img
                  src={info.qrCodeImageUrl}
                  alt="QR code PIX"
                  className="w-64 h-64 object-contain"
                />
              ) : (
                <div className="w-64 h-64 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground">
                  <QrCode className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-xs text-center px-4">
                    QR code ainda não disponível.
                  </p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Chave PIX
                </p>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <p className="font-mono text-sm break-all">{info.pixKey}</p>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 p-2 rounded-lg border hover:bg-muted transition-colors"
                    title="Copiar chave"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Beneficiário
                </p>
                <p className="font-medium mt-1">{info.recipientName}</p>
              </div>

              {info.institution && (
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Instituição
                  </p>
                  <p className="font-medium mt-1">{info.institution}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Cidade
                </p>
                <p className="font-medium mt-1">{info.city}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
