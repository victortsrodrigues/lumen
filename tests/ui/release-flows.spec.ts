import { test, expect, type Page } from "@playwright/test";
import { LegalDocumentsVersion } from "../../lib/api-client-react/src/generated/api.schemas";

async function anonymousApi(page: Page) {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({ status: 401, json: { error: "UNAUTHORIZED" } });
    return route.fulfill({
      json: path === "/api/auth/csrf" ? { csrfToken: "test-csrf" } : {},
    });
  });
}

test("privacy and terms are public on desktop and mobile even when the session returns 401", async ({ page }) => {
  await anonymousApi(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/privacidade");
    await expect(page.getByRole("heading", { name: "Política de Privacidade", exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: /^(Sobre|Contribuir)$/ })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link").first()).toHaveAttribute("href", "/login");
    await expect(page.locator('a[href="/site"], a[href^="/site/"], a[href="/donate"]')).toHaveCount(0);
    await expect(page.getByText("Igreja Presbiteriana Lumen", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "(32) 99922-1949" })).toHaveAttribute("href", "tel:+5532999221949");
    await expect(page.locator("article")).toContainText("400 dias");
    await expect(page).toHaveURL(/\/privacidade$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("navigation", { name: "Informações legais" }).getByRole("link", { name: "Termos de uso" }).click();
    await expect(page.getByRole("heading", { name: "Termos de Uso", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/termos$/);
    await expect(page.getByRole("banner").getByRole("link", { name: /^(Sobre|Contribuir)$/ })).toHaveCount(0);
    await expect(page.locator('a[href="/site"], a[href^="/site/"], a[href="/donate"]')).toHaveCount(0);
    await page.getByRole("banner").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/login$/);
  }
});

for (const authenticated of [false, true]) {
  test(`retired public pages redirect to login without loading content (authenticated=${authenticated})`, async ({ page }) => {
    await anonymousApi(page);
    if (authenticated) {
      await page.route("**/api/auth/me", (route) => route.fulfill({
        json: { id: "test-admin", name: "Admin de teste", email: "admin@example.test", role: "admin", status: "active", mfaEnabled: false },
      }));
    }
    const retiredRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/pages/public") || path === "/api/pix/donate") retiredRequests.push(path);
    });
    for (const path of ["/site", "/site/sobre", "/donate"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("button", { name: "Entrar no sistema" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Nossa Igreja|Contribuir via PIX/ })).toHaveCount(0);
    }
    expect(retiredRequests).toEqual([]);
  });
}

test("registration links open separately and require an unchecked, versioned legal acceptance", async ({ page }) => {
  await anonymousApi(page);
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/auth/register", (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { emailVerificationRequired: true } });
  });
  await page.goto("/register");
  const checkbox = page.getByRole("checkbox", { name: "Li a Política de Privacidade e aceito os Termos de Uso." });
  await expect(checkbox).not.toBeChecked();
  const link = page.getByRole("link", { name: "Ler Política de Privacidade (nova aba)" });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("href", "/privacidade");
  await expect(page.getByRole("link", { name: "Ler Termos de Uso (nova aba)" })).toHaveAttribute("href", "/termos");
  await page.getByPlaceholder("João Silva").fill("Pessoa de Teste");
  await page.getByPlaceholder("seu@email.com").fill("person@example.test");
  await page.getByPlaceholder("Mínimo 8 caracteres").fill("Test-password123!");
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByText("Você deve aceitar os termos")).toBeVisible();
  expect(submitted).toBeUndefined();
  await checkbox.check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByRole("heading", { name: "Solicitação enviada", exact: true })).toBeVisible();
  expect(submitted).toMatchObject({ consentAccepted: true, legalDocumentsVersion: Object.values(LegalDocumentsVersion)[0] });
});

test("login shows an actionable verification message without the HTTP status code", async ({
  page,
}) => {
  await anonymousApi(page);
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: "EMAIL_NOT_VERIFIED",
        message: "Confirme seu e-mail antes de acessar a plataforma",
      },
    }),
  );
  await page.goto("/login");
  await page.getByPlaceholder("seu@email.com").fill("person@example.test");
  await page.locator('input[name="password"]').fill("Test-password123!");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(
    page.getByText("Confirme seu e-mail antes de acessar a plataforma", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reenviar e-mail de verificação" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("HTTP 403");
});

test("recovery submits the fragment token with CSRF and removes it from the URL on success", async ({
  page,
}) => {
  await anonymousApi(page);
  let submitted: unknown;
  let csrf: string | undefined;
  await page.route("**/api/auth/reset-password", (route) => {
    submitted = route.request().postDataJSON();
    csrf = route.request().headers()["x-csrf-token"];
    return route.fulfill({ json: { message: "Senha redefinida com sucesso" } });
  });
  await page.goto(
    "/reset-password#token=synthetic-recovery-token-not-a-secret",
  );
  await page
    .locator('input[name="password"]')
    .fill("Changed-test-password123!");
  await page
    .locator('input[name="confirmation"]')
    .fill("Changed-test-password123!");
  await page.locator('button[type="submit"]').click();
  await expect(
    page.getByRole("heading", { name: "Senha redefinida", exact: true }),
  ).toBeVisible();
  expect(submitted).toEqual({
    token: "synthetic-recovery-token-not-a-secret",
    password: "Changed-test-password123!",
  });
  expect(csrf).toBe("test-csrf");
  await expect(page).toHaveURL(/\/reset-password$/);
});

test("forum moderation uses the pinned and locked states returned by the API", async ({
  page,
}) => {
  const topic = {
    id: "topic-test",
    title: "Tópico de teste",
    body: "Mensagem",
    category: "geral",
    authorId: "admin-test",
    authorName: "Admin",
    createdAt: new Date().toISOString(),
    isPinned: true,
    isLocked: true,
    replies: [],
    replyCount: 0,
  };
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/auth/me")
      body = {
        id: "admin-test",
        name: "Admin",
        email: "admin@example.test",
        role: "admin",
        status: "active",
        mfaEnabled: false,
      };
    else if (path === "/api/auth/csrf") body = { csrfToken: "test-csrf" };
    else if (path === "/api/forum/topics/topic-test") body = topic;
    else if (path === "/api/forum/topics/pin/topic-test") {
      topic.isPinned = false;
      body = topic;
    } else if (path === "/api/forum/topics/lock/topic-test") {
      topic.isLocked = false;
      body = topic;
    } else if (path.includes("notifications"))
      body = { count: 0, notifications: [], total: 0 };
    await route.fulfill({ json: body });
  });
  await page.goto("/forum/topic-test");
  await expect(page.getByTitle("Desafixar", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Destrancar", { exact: true })).toBeVisible();
  await page.getByTitle("Desafixar", { exact: true }).click();
  await expect(page.getByTitle("Fixar", { exact: true })).toBeVisible();
  await page.getByTitle("Destrancar", { exact: true }).click();
  await expect(page.getByTitle("Trancar", { exact: true })).toBeVisible();
});
