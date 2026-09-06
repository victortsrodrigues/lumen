import { useEffect, useId, useState } from "react";
import {
  approveAccount,
  updateAccountMemberLink,
  useListAccountMemberOptions,
  getListAccountMemberOptionsQueryKey,
  type AdminAccount,
  type AccountMemberOption,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/api-error";

export function AccountMemberDialog({
  account,
  mode,
  onClose,
  onSuccess,
}: {
  account: AdminAccount;
  mode: "approve" | "link" | "unlink";
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const radioName = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AccountMemberOption | "auto" | null>(
    () => {
      if (mode === "unlink") return null;
      if (account.memberId)
        return {
          id: account.memberId,
          name: account.memberName || "Membro atual",
          status: "",
        };
      return mode === "approve" && !account.memberLinkReviewedAt
        ? "auto"
        : null;
    },
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const options = useListAccountMemberOptions(
    { search: query, page },
    {
      query: {
        queryKey: getListAccountMemberOptionsQueryKey({ search: query, page }),
        enabled: mode !== "unlink",
        staleTime: 0,
      },
    },
  );
  const selectedMember = selected && selected !== "auto" ? selected : null;
  const mismatch =
    selectedMember?.email &&
    selectedMember.email.trim().toLowerCase() !==
      account.email.trim().toLowerCase();
  const title =
    mode === "approve"
      ? "Aprovar solicitação"
      : mode === "unlink"
        ? "Desvincular membro"
        : account.memberId
          ? "Alterar vínculo"
          : "Vincular membro";
  const unchanged =
    mode === "link" &&
    (selectedMember?.id ?? null) === (account.memberId ?? null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payload =
        selected === "auto" ? {} : { memberId: selectedMember?.id ?? null };
      if (mode === "approve") await approveAccount(account.id, payload);
      else
        await updateAccountMemberLink(account.id, {
          memberId: selectedMember?.id ?? null,
        });
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Não foi possível salvar o vínculo. Tente novamente.",
        ),
      );
      void options.refetch();
      setSaving(false);
      return;
    }
    // Only close after the server confirms the change. Keep errors in the dialog.
    onClose();
    await onSuccess(
      mode === "approve"
        ? "Conta aprovada. A confirmação de e-mail continua obrigatória."
        : "Vínculo atualizado. As sessões anteriores dessa conta foram encerradas.",
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto break-words p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {account.name} — {account.email}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Vínculo atual:{" "}
          <strong>{account.memberName || "Não vinculado"}</strong>.
        </p>
        {mode === "unlink" ? (
          <p className="text-sm text-muted-foreground">
            Somente a associação será removida. A conta, o membro e seu
            histórico serão preservados. A conta não terá acesso aos dados
            pessoais desse membro e precisará entrar novamente.
          </p>
        ) : (
          <>
            <fieldset disabled={saving} className="space-y-3">
              <legend className="mb-2 text-sm font-medium">
                Escolha o membro correspondente
              </legend>
              {mode === "approve" &&
                !account.memberId &&
                !account.memberLinkReviewedAt && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={radioName}
                      checked={selected === "auto"}
                      onChange={() => setSelected("auto")}
                    />
                    Identificar pelo e-mail apenas se houver um único membro
                    correspondente e disponível.
                  </label>
                )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={radioName}
                  checked={selected === null}
                  onChange={() => setSelected(null)}
                />
                {mode === "approve"
                  ? "Aprovar sem vínculo com membro"
                  : "Deixar sem vínculo"}
              </label>
              <label className="block text-sm" htmlFor={`${radioName}-search`}>
                Buscar por nome ou e-mail
              </label>
              <input
                id={`${radioName}-search`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border bg-background p-2 text-sm"
                placeholder="Nome ou e-mail do membro"
              />
              {options.isFetching && (
                <p role="status" className="text-sm text-muted-foreground">
                  Buscando membros…
                </p>
              )}
              {options.isError && (
                <p role="alert" className="text-sm text-destructive">
                  Não foi possível carregar os membros.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => options.refetch()}
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
              {!options.isFetching &&
                !options.isError &&
                options.data?.members.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum membro encontrado.
                  </p>
                )}
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {options.data?.members.map((member) => {
                  const occupied = Boolean(
                    member.linkedAccountId &&
                    member.linkedAccountId !== account.id,
                  );
                  return (
                    <label
                      key={member.id}
                      className={`flex gap-3 rounded-lg border p-3 text-sm ${occupied ? "opacity-60" : "cursor-pointer"}`}
                    >
                      <input
                        type="radio"
                        name={radioName}
                        disabled={occupied}
                        checked={selectedMember?.id === member.id}
                        onChange={() => setSelected(member)}
                      />
                      <span>
                        <strong>{member.name}</strong>
                        <span className="block text-muted-foreground">
                          {member.email || "Sem e-mail"} ·{" "}
                          {member.status.replaceAll("_", " ")} · ID{" "}
                          {member.id.slice(0, 8)}
                        </span>
                        {occupied && (
                          <span className="block text-amber-700">
                            Já vinculado à conta{" "}
                            {member.linkedAccountName || member.linkedAccountId}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex items-center justify-end gap-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={saving || page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span>Página {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  saving ||
                  !options.data ||
                  page * options.data.limit >= options.data.total
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
            <p className="rounded-lg bg-muted p-3 text-sm">
              Novo vínculo:{" "}
              <strong>
                {selected === "auto"
                  ? "Correspondência única de e-mail, se disponível"
                  : selectedMember?.name || "Não vinculado"}
              </strong>
              . Os registros dos membros não serão alterados.
            </p>
            {mismatch && (
              <p
                role="note"
                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              >
                Os e-mails são diferentes. Confirme que a conta e o membro
                selecionado pertencem à mesma pessoa.
              </p>
            )}
            {mode === "link" && (
              <p className="text-sm text-muted-foreground">
                A alteração encerra as sessões dessa conta. Aprovação, papel e
                verificação de e-mail não mudam.
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving || unchanged} onClick={save}>
            {saving
              ? "Salvando…"
              : mode === "approve"
                ? "Confirmar aprovação"
                : mode === "unlink"
                  ? "Confirmar desvinculação"
                  : "Salvar vínculo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
