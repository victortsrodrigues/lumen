import { test, expect, type Page } from "@playwright/test";

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
