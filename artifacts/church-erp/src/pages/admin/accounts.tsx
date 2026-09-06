import { useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  type AdminAccount,
  useApproveAccount,
  useBlockAccount,
  useListAccounts,
  useReactivateAccount,
  useRevokeAccount,
  useUnblockAccount,
  useUpdateAccountRole,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  Ban,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  MailCheck,
  MailWarning,
  RefreshCw,
  Search,
  ShieldOff,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  active: "Ativa",
  blocked: "Bloqueada",
  revoked: "Revogada",
  deleting: "Excluindo",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  blocked: "bg-orange-100 text-orange-800",
  revoked: "bg-red-100 text-red-800",
  deleting: "bg-slate-100 text-slate-700",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  leader: "Líder",
  member: "Membro",
};

type ConfirmAction = {
  kind: "block" | "revoke";
  account: AdminAccount;
} | null;

export default function AccountsAdminPage() {
  const { user, getValidCsrfToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("status");
    return requested && Object.hasOwn(STATUS_LABELS, requested) ? requested : "";
  });
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [reason, setReason] = useState("");

  const params = useMemo(() => ({
    page,
    limit: 20,
    ...(status ? { status: status as "pending" | "active" | "blocked" | "revoked" | "deleting" } : {}),
    ...(role ? { role: role as "admin" | "leader" | "member" } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }), [page, status, role, search]);
  const { data, isLoading, isFetching } = useListAccounts(params, {
    query: { enabled: user?.role === "admin" } as any,
  });

  const refresh = async (message: string) => {
    await queryClient.invalidateQueries({
      predicate: query => String(query.queryKey[0]).startsWith("/api/admin/accounts"),
    });
    toast({ title: "Concluído", description: message });
  };
  const approve = useApproveAccount({ mutation: { onSuccess: () => refresh("Conta aprovada.") } });
  const block = useBlockAccount({ mutation: { onSuccess: () => refresh("Conta bloqueada.") } });
  const unblock = useUnblockAccount({ mutation: { onSuccess: () => refresh("Conta desbloqueada.") } });
  const revoke = useRevokeAccount({ mutation: { onSuccess: () => refresh("Acesso revogado.") } });
  const reactivate = useReactivateAccount({ mutation: { onSuccess: () => refresh("Conta enviada novamente para o estado ativo.") } });
  const updateRole = useUpdateAccountRole({ mutation: { onSuccess: () => refresh("Papel atualizado. A sessão anterior foi encerrada.") } });

  const isMutating = approve.isPending || block.isPending || unblock.isPending || revoke.isPending || reactivate.isPending || updateRole.isPending;

  async function runSimpleAction(kind: "approve" | "unblock" | "reactivate", account: AdminAccount) {
    const csrfToken = await getValidCsrfToken();
    if (kind === "approve") approve.mutate({ id: account.id, data: { csrfToken } });
    if (kind === "unblock") unblock.mutate({ id: account.id, data: { csrfToken } });
    if (kind === "reactivate") reactivate.mutate({ id: account.id, data: { csrfToken } });
  }

  async function changeRole(account: AdminAccount) {
    const csrfToken = await getValidCsrfToken();
    const nextRole = account.role === "leader" ? "member" : "leader";
    updateRole.mutate({ id: account.id, data: { csrfToken, role: nextRole } });
  }

  async function confirmStatusAction() {
    if (!confirmAction || !reason.trim()) return;
    const csrfToken = await getValidCsrfToken();
    const payload = { id: confirmAction.account.id, data: { csrfToken, reason: reason.trim() } };
    if (confirmAction.kind === "block") block.mutate(payload);
    else revoke.mutate(payload);
    setConfirmAction(null);
    setReason("");
  }

  if (user?.role !== "admin") return <Redirect to="/" />;

  const accounts = data?.accounts ?? [];
  const summary = data?.summary ?? { pending: 0, active: 0, blocked: 0, revoked: 0, deleting: 0 };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return (
    <AppLayout breadcrumbs={[{ label: "Administração" }, { label: "Contas e acessos" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="h-6 w-6" /> Contas e acessos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aprove solicitações e gerencie os acessos à plataforma.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            ["Pendentes", summary.pending, Clock3, "text-amber-600"],
            ["Ativas", summary.active, CheckCircle2, "text-emerald-600"],
            ["Bloqueadas", summary.blocked, Ban, "text-orange-600"],
            ["Revogadas", summary.revoked, ShieldOff, "text-red-600"],
          ] as Array<[string, number, LucideIcon, string]>).map(([label, value, Icon, color]) => (
            <div key={label as string} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <p className="mt-2 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nome ou e-mail" className="w-full rounded-xl border bg-background py-2.5 pl-10 pr-3 text-sm" />
          </div>
          <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="rounded-xl border bg-background px-3 py-2.5 text-sm">
            <option value="">Todos os estados</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={role} onChange={event => { setRole(event.target.value); setPage(1); }} className="rounded-xl border bg-background px-3 py-2.5 text-sm">
            <option value="">Todos os papéis</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {isFetching && <Loader2 className="m-2 h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr><th className="p-4">Conta</th><th className="p-4">Papel</th><th className="p-4">Estado</th><th className="p-4">Membro vinculado</th><th className="p-4">Último acesso</th><th className="p-4 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && <tr><td colSpan={6} className="p-10 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></td></tr>}
                {!isLoading && accounts.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Nenhuma conta encontrada.</td></tr>}
                {accounts.map(account => {
                  const ownAccount = account.id === user.id;
                  return (
                    <tr key={account.id} className="align-top">
                      <td className="p-4">
                        <p className="font-medium">{account.name}</p>
                        <p className="text-xs text-muted-foreground">{account.email}</p>
                        <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${account.emailVerifiedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {account.emailVerifiedAt ? <MailCheck className="h-3 w-3" /> : <MailWarning className="h-3 w-3" />}
                          {account.emailVerifiedAt ? "E-mail verificado" : "Aguardando verificação"}
                        </span>
                      </td>
                      <td className="p-4">{ROLE_LABELS[account.role]}</td>
                      <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[account.status]}`}>{STATUS_LABELS[account.status]}</span>{account.statusReason && <p className="mt-2 max-w-48 text-xs text-muted-foreground">{account.statusReason}</p>}</td>
                      <td className="p-4 text-muted-foreground">{account.memberName || "Não vinculado"}</td>
                      <td className="p-4 text-muted-foreground">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("pt-BR") : "Nunca acessou"}</td>
                      <td className="p-4"><div className="flex min-w-64 flex-wrap justify-end gap-2">
                        {account.status === "pending" && <button disabled={isMutating} onClick={() => runSimpleAction("approve", account)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Aprovar</button>}
                        {account.status === "active" && account.role !== "admin" && <button disabled={isMutating} onClick={() => changeRole(account)} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">{account.role === "leader" ? "Tornar membro" : "Tornar líder"}</button>}
                        {account.status === "active" && !ownAccount && <button disabled={isMutating} onClick={() => setConfirmAction({ kind: "block", account })} className="rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50">Bloquear</button>}
                        {account.status === "blocked" && <button disabled={isMutating} onClick={() => runSimpleAction("unblock", account)} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"><RefreshCw className="mr-1 inline h-3 w-3" />Desbloquear</button>}
                        {["active", "blocked"].includes(account.status) && !ownAccount && <button disabled={isMutating} onClick={() => setConfirmAction({ kind: "revoke", account })} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Revogar</button>}
                        {account.status === "revoked" && <button disabled={isMutating} onClick={() => runSimpleAction("reactivate", account)} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"><KeyRound className="mr-1 inline h-3 w-3" />Reativar</button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{data?.total ?? 0} conta(s)</span>
          <div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Anterior</button><span>{page} de {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Próxima</button></div>
        </div>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmAction(null)}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <h2 className="text-lg font-bold">{confirmAction.kind === "block" ? "Bloquear conta" : "Revogar acesso"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">A sessão de <strong>{confirmAction.account.name}</strong> será encerrada imediatamente.</p>
            <label className="mt-5 block text-sm font-medium">Motivo *</label>
            <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Informe o motivo desta ação" />
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirmAction(null)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={!reason.trim() || isMutating} onClick={confirmStatusAction} className="rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground disabled:opacity-50">Confirmar</button></div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
