import { test, expect, type Page } from "@playwright/test";

async function mockAccounts(page: Page, failFirst = false) {
  const entry = {
    id: "test-account",
    name: "Conta de teste",
    email: "account@example.test",
    status: "pending",
    role: "member",
    emailVerifiedAt: null,
    memberId: null as string | null,
    memberName: null as string | null,
    memberLinkReviewedAt: null,
    statusReason: null as string | null,
    requestedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const members = [
    {
      id: "member-free",
      name: "Pessoa do rol",
      email: "person@example.test",
      status: "ativo",
      linkedAccountId: null,
      linkedAccountName: null,
    },
    {
      id: "member-taken",
      name: "Pessoa ocupada",
      email: "taken@example.test",
      status: "ativo",
      linkedAccountId: "other-account",
      linkedAccountName: "Outra conta",
    },
  ];
  const mutations: {
    path: string;
    body: Record<string, unknown>;
    csrf: string | undefined;
  }[] = [];
  let shouldFail = failFirst;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    let body: unknown;
    if (path === "/api/auth/me")
      body = {
        id: "admin-test",
        name: "Admin de teste",
        email: "admin@example.test",
        role: "admin",
        status: "active",
        mfaEnabled: false,
      };
    else if (path === "/api/auth/csrf") body = { csrfToken: "synthetic-csrf" };
    else if (path === "/api/admin/accounts/member-options") {
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const filtered = members.filter((m) =>
        `${m.name} ${m.email}`.toLowerCase().includes(search),
      );
      body = { members: filtered, page: 1, total: filtered.length, limit: 20 };
    } else if (path === "/api/admin/accounts")
      body = {
        accounts: [entry],
        total: 1,
        page: 1,
        limit: 20,
        summary: {
          pending: 0,
          rejected: 0,
          active: 0,
          blocked: 0,
          revoked: 0,
          deleting: 0,
          [entry.status]: 1,
        },
      };
    else if (path.startsWith("/api/admin/accounts/test-account/")) {
      const data = req.postDataJSON() ?? {};
      mutations.push({ path, body: data, csrf: req.headers()["x-csrf-token"] });
      if (shouldFail) {
        shouldFail = false;
        return route.fulfill({
          status: 409,
          json: {
            error: "CONFLICT",
            message: "A conta mudou. Confira os dados e tente novamente.",
          },
        });
      }
      if (path.endsWith("/reject")) {
        entry.status = "rejected";
        entry.statusReason = data.reason;
      }
      if (path.endsWith("/reopen")) {
        entry.status = "pending";
        entry.statusReason = null;
      }
      if (path.endsWith("/approve")) entry.status = "active";
      if ("memberId" in data) {
        entry.memberId = data.memberId;
        entry.memberName =
          members.find((m) => m.id === data.memberId)?.name ?? null;
      }
      body = entry;
    } else if (path.includes("notifications"))
      body = { count: 0, notifications: [], total: 0 };
    else body = {};
    await route.fulfill({ json: body });
  });
  // Do not contact external services, even if an unrelated component requests one.
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/admin/accounts");
  await expect(
    page.getByRole("heading", { name: "Contas e acessos" }),
  ).toBeVisible();
  await expect(page.getByText("Conta de teste", { exact: true })).toBeVisible();
  return { mutations, entry };
}

test("reject requires a reason, keeps errors visible and reopens as pending", async ({
  page,
}) => {
  const { mutations } = await mockAccounts(page, true);
  await page
    .getByRole("button", { name: "Rejeitar solicitação", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Motivo *").fill("Solicitação duplicada");
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "A conta mudou. Confira os dados e tente novamente.",
  );
  await expect(dialog).not.toContainText("HTTP 409");
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Reabrir solicitação" }).click();
  await expect(dialog).toContainText(
    "Reabrir não aprova a conta nem confirma o e-mail",
  );
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rejeitar solicitação", exact: true }),
  ).toBeVisible();
  expect(mutations[0].body).toEqual({ reason: "Solicitação duplicada" });
  expect(mutations.every((m) => m.csrf === "synthetic-csrf")).toBe(true);
});

test("member picker warns about email mismatch, disables occupied members and supports unlink", async ({
  page,
}) => {
  const { mutations } = await mockAccounts(page, true);
  await page
    .getByRole("button", { name: "Vincular membro", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("radio", { name: /Pessoa ocupada/ }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Buscar por nome ou e-mail", { exact: true })
    .fill("inexistente");
  await expect(dialog.getByText("Nenhum membro encontrado.")).toBeVisible();
  await dialog
    .getByLabel("Buscar por nome ou e-mail", { exact: true })
    .fill("");
  await dialog.getByRole("radio", { name: /Pessoa do rol/ }).check();
  await expect(dialog.getByRole("note")).toContainText(
    "Os e-mails são diferentes",
  );
  await dialog.getByRole("button", { name: "Salvar vínculo" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar vínculo" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Alterar vínculo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Desvincular", exact: true }).click();
  await expect(dialog).toContainText(
    "A conta, o membro e seu histórico serão preservados",
  );
  await dialog.getByRole("button", { name: "Confirmar desvinculação" }).click();
  await expect(
    page.getByRole("button", { name: "Vincular membro", exact: true }),
  ).toBeVisible();
  expect(mutations.map((m) => m.body)).toEqual([
    { memberId: "member-free" },
    { memberId: "member-free" },
    { memberId: null },
  ]);
});

test("approval permits an explicit no-member choice without claiming email verification", async ({
  page,
}) => {
  const { mutations } = await mockAccounts(page);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("radio", { name: "Aprovar sem vínculo com membro" })
    .check();
  await dialog.getByRole("button", { name: "Confirmar aprovação" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Aguardando verificação", { exact: true }),
  ).toBeVisible();
  expect(mutations[0].body).toEqual({ memberId: null });
});

test("member dialog fits mobile and retains accessible controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAccounts(page);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Aprovar solicitação" }),
  ).toBeVisible();
  // Wait for Radix's entrance animation before measuring its final position.
  await expect
    .poll(async () => (await dialog.boundingBox())!.x)
    .toBeGreaterThanOrEqual(0);
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole("radio", { name: /Pessoa do rol/ }).check();
  await dialog.getByRole("button", { name: "Confirmar aprovação" }).click();
  await expect(dialog).toHaveCount(0);
});
