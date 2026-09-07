import { test, expect, type Page } from "@playwright/test";

type Role = "admin" | "leader" | "member";

async function mockSession(page: Page, role: Role | null) {
  const retiredRequests: string[] = [];
  await page.route(/^https:\/\//, route => route.abort());
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/lgpd")) {
      retiredRequests.push(path);
      return route.fulfill({ status: 500, json: { error: "RETIRED_UI" } });
    }
    if (path === "/api/auth/me") {
      return role
        ? route.fulfill({ json: { id: "account-test", name: "Pessoa de Teste", email: "person@example.test", role, status: "active", memberId: null, mfaEnabled: false } })
        : route.fulfill({ status: 401, json: { error: "UNAUTHORIZED" } });
    }
    if (path === "/api/dashboard/member-stats") {
      return route.fulfill({ json: { profile: null, enrolledCourses: 0, upcomingRegisteredEvents: [], myMinistries: [], recentArticles: [] } });
    }
    if (path === "/api/members/me") {
      return route.fulfill({ status: 404, json: { error: "NO_LINKED_MEMBER" } });
    }
    return route.fulfill({ json: { songs: [], suggestions: [], notifications: [], count: 0, total: 0 } });
  });
  return retiredRequests;
}

for (const role of ["admin", "leader", "member"] as const) {
  test(`${role}: legal pages are accessed through the sidebar, not repeated footers`, async ({ page }) => {
    const retiredRequests = await mockSession(page, role);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/songs");
      await expect(page.getByRole("heading", { name: "Músicas", exact: true })).toBeVisible();
      await expect(page.getByRole("main").locator('a[href="/privacidade"], a[href="/termos"]')).toHaveCount(0);
      await expect(page.locator('a[href^="/lgpd"]')).toHaveCount(0);
      if (width < 768) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      const navigation = page.getByRole("navigation", { name: "Menu principal", exact: true });
      const menu = navigation.getByRole("button", { name: "Privacidade e termos", exact: true });
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await menu.click();
      await expect(page).toHaveURL(/\/songs$/);
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await menu.press("Enter");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await menu.press("Space");
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await navigation.getByRole("link", { name: "Política de Privacidade", exact: true }).click();
      await expect(page).toHaveURL(/\/privacidade$/);
      await expect(page.getByRole("heading", { name: "Política de Privacidade", exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Informações legais" })).toHaveCount(0);
      await expect(page.locator("article")).not.toContainText("Meus Dados");
      await expect(page.getByRole("link", { name: "(32) 99922-1949" })).toBeVisible();
      if (width < 768) {
        await expect(navigation).not.toBeInViewport();
        await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      }
      await expect(navigation.getByRole("link", { name: "Política de Privacidade", exact: true })).toHaveAttribute("aria-current", "page");
      await navigation.getByRole("link", { name: "Termos de Uso", exact: true }).click();
      await expect(page).toHaveURL(/\/termos$/);
      await expect(page.getByRole("heading", { name: "Termos de Uso", exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Informações legais" })).toHaveCount(0);
      if (width < 768) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      await expect(navigation.getByRole("link", { name: "Termos de Uso", exact: true })).toHaveAttribute("aria-current", "page");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    expect(retiredRequests).toEqual([]);
  });
}

for (const role of [null, "admin", "leader", "member"] as const) {
  test(`retired LGPD URLs redirect without loading personal data (role=${role ?? "anonymous"})`, async ({ page }) => {
    const retiredRequests = await mockSession(page, role);
    for (const path of ["/lgpd", "/lgpd/my-data", "/lgpd/admin-requests"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/privacidade$/);
      await expect(page.getByRole("heading", { name: "Política de Privacidade", exact: true })).toBeVisible();
      await expect(page.getByText("Erro ao carregar seus dados.", { exact: true })).toHaveCount(0);
    }
    expect(retiredRequests).toEqual([]);
  });
}

test("member dashboard no longer links to LGPD and account deletion stays on the profile", async ({ page }) => {
  const retiredRequests = await mockSession(page, "member");
  await page.goto("/");
  await expect(page.getByText("Sua conta ainda não está vinculada a um membro.", { exact: false })).toBeVisible();
  await expect(page.getByRole("main").locator('a[href^="/lgpd"]')).toHaveCount(0);
  await expect(page.getByRole("main").getByText("Meus Dados", { exact: true })).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Excluir minha conta", exact: true })).toBeVisible();
  expect(retiredRequests).toEqual([]);
});
