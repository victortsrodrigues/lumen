import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { useResetPassword } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/layout/AuthLayout";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "A senha deve ter no mínimo 8 caracteres")
      .max(128, "A senha excede o tamanho permitido"),
    confirmation: z.string(),
  })
  .refine((data) => data.password === data.confirmation, {
    message: "As senhas não coincidem",
    path: ["confirmation"],
  });

type ResetPasswordForm = z.infer<typeof schema>;

function tokenFromFragment(): string {
  return (
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ??
    ""
  );
}

export default function ResetPassword() {
  const reset = useResetPassword({ mutation: { meta: { silentError: true } } });
  const [token] = useState(tokenFromFragment);
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<"form" | "success" | "error">(
    token ? "form" : "error",
  );
  const [message, setMessage] = useState(
    token ? "" : "Este link de recuperação está incompleto.",
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: ResetPasswordForm) {
    try {
      const response = await reset.mutateAsync({
        data: { token, password: data.password },
      });
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
          "O link é inválido ou expirou. Solicite uma nova recuperação.",
      );
      setState("error");
    }
  }

  if (state !== "form") {
    return (
      <AuthLayout
        title={state === "success" ? "Senha redefinida" : "Link inválido"}
      >
        <div className="space-y-6 text-center">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${state === "success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
          >
            {state === "success" ? (
              <CheckCircle2 className="h-8 w-8" />
            ) : (
              <XCircle className="h-8 w-8" />
            )}
          </div>
          <p className="text-muted-foreground">{message}</p>
          <Link
            href={state === "success" ? "/login" : "/forgot-password"}
            className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {state === "success" ? "Entrar na conta" : "Solicitar novo link"}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar nova senha">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Nova senha
          </label>
          <div className="relative">
            <input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 pr-12 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Confirmar nova senha
          </label>
          <input
            {...register("confirmation")}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          {errors.confirmation && (
            <p className="text-sm text-destructive">
              {errors.confirmation.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={reset.isPending}
          className="flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {reset.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            "Redefinir senha"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
