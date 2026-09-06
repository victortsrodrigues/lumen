import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useDeleteOwnAccount } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth-context";
import { useToast } from "@/hooks/use-toast";

export function DeleteAccountSection() {
  const [, setLocation] = useLocation();
  const { getValidCsrfToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const deletion = useDeleteOwnAccount({
    mutation: {
      meta: { silentError: true },
      onSuccess: async () => {
        queryClient.clear();
        toast({ title: "Conta excluída", description: "Seus dados pessoais foram removidos ou anonimizados." });
        setLocation("/login");
      },
      onError: (error) => {
        toast({
          title: "Não foi possível excluir a conta",
          description: error.message,
          variant: "destructive",
        });
      },
    },
  });

  async function submit() {
    if (!password || confirmation !== "EXCLUIR") return;
    const csrfToken = await getValidCsrfToken();
    deletion.mutate({ data: { password, confirmation: "EXCLUIR", csrfToken } });
  }

  function close() {
    if (deletion.isPending) return;
    setOpen(false);
    setPassword("");
    setConfirmation("");
  }

  return (
    <>
      <section className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-destructive">Excluir minha conta</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Encerra seu acesso imediatamente e remove ou anonimiza seus dados pessoais. Esta ação não depende de aprovação e não pode ser desfeita.
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90">
            <Trash2 className="h-4 w-4" /> Excluir conta
          </button>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-destructive/10 p-2 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
              <div><h2 className="text-lg font-bold">Excluir conta permanentemente</h2><p className="mt-1 text-sm text-muted-foreground">Seu acesso será encerrado e o administrador apenas será notificado depois da exclusão.</p></div>
            </div>

            <div className="mt-6 space-y-4">
              <div><label className="text-sm font-medium">Senha atual</label><input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5" /></div>
              <div><label className="text-sm font-medium">Digite EXCLUIR para confirmar</label><input value={confirmation} onChange={event => setConfirmation(event.target.value.toUpperCase())} autoComplete="off" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5" /></div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-4">
              <button onClick={close} disabled={deletion.isPending} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Cancelar</button>
              <button onClick={submit} disabled={deletion.isPending || !password || confirmation !== "EXCLUIR"} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground disabled:opacity-50">
                {deletion.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
