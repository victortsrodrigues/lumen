import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Copy, Check, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Informational details supplied by the church. This page does not generate
// payment codes or create donation records.
const CONTRIBUTION_DETAILS = {
  pixKey: "presbiterianalumen@gmail.com",
  recipientName: "PRESBITÉRIO DE JUIZ DE FORA",
  institution: "CC CREDICAF LTDA",
};

export default function ContributionsPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTRIBUTION_DETAILS.pixKey);
      setCopied(true);
      toast({ title: "Chave copiada", description: "Cole no seu app de banco." });
    } catch {
      setCopied(false);
      toast({
        title: "Não foi possível copiar",
        description: "Selecione a chave Pix e copie manualmente.",
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout breadcrumbs={[{ label: "Contribuições" }]}>
      <div className="max-w-xl mx-auto">
        <div className="text-center space-y-2 mb-8">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Heart className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Contribuições</h1>
          <p className="text-muted-foreground text-sm">
            Dízimos e ofertas
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <dl className="space-y-5">
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wider">Chave Pix (e-mail)</dt>
              <dd className="flex flex-col gap-3 mt-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono text-sm break-all select-all">{CONTRIBUTION_DETAILS.pixKey}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex shrink-0 items-center gap-2 self-start px-3 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
                  aria-label="Copiar chave Pix"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? "Copiada!" : "Copiar chave"}
                </button>
              </dd>
            </div>
            <div className="border-t pt-5">
              <dt className="text-xs text-muted-foreground uppercase tracking-wider">Beneficiário</dt>
              <dd className="font-medium mt-1">{CONTRIBUTION_DETAILS.recipientName}</dd>
            </div>
            <div className="border-t pt-5">
              <dt className="text-xs text-muted-foreground uppercase tracking-wider">Instituição</dt>
              <dd className="font-medium mt-1">{CONTRIBUTION_DETAILS.institution}</dd>
            </div>
          </dl>
        </div>
        <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
          No aplicativo do seu banco, escolha Pix, cole a chave e confira os dados do recebedor antes de confirmar.
        </p>
      </div>
    </AppLayout>
  );
}
