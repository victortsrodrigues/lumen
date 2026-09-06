import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2, MailCheck, XCircle } from "lucide-react";
import { useVerifyEmail } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/layout/AuthLayout";

function tokenFromFragment(): string {
  return (
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ??
    ""
  );
}

export default function VerifyEmail() {
  const verify = useVerifyEmail({ mutation: { meta: { silentError: true } } });
  const [token] = useState(tokenFromFragment);
  const [state, setState] = useState<"ready" | "success" | "error">(
    token ? "ready" : "error",
  );
  const [message, setMessage] = useState(
    token ? "" : "Este link de verificação está incompleto.",
  );

  async function confirmEmail() {
    try {
      const response = await verify.mutateAsync({ data: { token } });
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      setMessage(response.message);
      setState("success");
    } catch (error: any) {
      setMessage(
        error?.data?.message ||
          "O link é inválido ou expirou. Solicite uma nova mensagem.",
      );
      setState("error");
    }
  }

  return (
    <AuthLayout
      title={state === "success" ? "E-mail confirmado" : "Confirmar e-mail"}
    >
      <div className="space-y-6 text-center">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            state === "success"
              ? "bg-emerald-100 text-emerald-700"
              : state === "error"
                ? "bg-red-100 text-red-700"
                : "bg-cyan-100 text-cyan-700"
          }`}
        >
          {state === "success" ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : state === "error" ? (
            <XCircle className="h-8 w-8" />
          ) : (
            <MailCheck className="h-8 w-8" />
          )}
        </div>

        {state === "ready" && (
          <>
            <p className="text-muted-foreground">
              Confirme que este endereço de e-mail pertence a você.
            </p>
            <button
              type="button"
              disabled={verify.isPending}
              onClick={confirmEmail}
              className="flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {verify.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Confirmar meu e-mail"
              )}
            </button>
          </>
        )}

        {state !== "ready" && (
          <p className="text-muted-foreground">{message}</p>
        )}

        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-xl border px-6 py-3.5 font-semibold hover:bg-muted"
        >
          Ir para o login
        </Link>
      </div>
    </AuthLayout>
  );
}
