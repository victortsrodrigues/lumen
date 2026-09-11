import { test, expect, type Page, type Route } from "@playwright/test";

// A browser outside Brasília must still display the church's local date/time.
test.use({ timezoneId: "America/Los_Angeles" });

const upcoming = {
  cultoId: "culto-test",
  eventId: "event-test",
  title: "Culto de gratidão",
  startDate: "2026-09-14T01:00:00.000Z",
  location: "Templo da Lumen",
  responsibleName: "Responsável de teste",
  hasCommunion: true,
  hasBaptism: true,
  hasMemberReception: true,
};
const upcomingResponse = {
  items: [upcoming, { ...upcoming, cultoId: "later-culto", title: "Culto posterior" }],
};

async function mockDashboard(
  page: Page,
  role: "admin" | "leader" | "member" | null,
  respond: (route: Route) => Promise<void> = route => route.fulfill({ json: upcomingResponse }),
) {
  await page.route(/^https:\/\//, route => route.abort());
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      return role
        ? route.fulfill({ json: { id: "account-test", name: "Pessoa de Teste", email: "person@example.test", role, status: "active", memberId: null, mfaEnabled: false } })
        : route.fulfill({ status: 401, json: { error: "UNAUTHORIZED" } });
    }
    if (path === "/api/cultos/upcoming") return respond(route);
    if (path === "/api/dashboard/stats") return route.fulfill({ json: {
      members: { total: 0, newThisMonth: 0, byStatus: {} },
      finance: null,
      events: { upcomingCount: 0, nextMonthCount: 0, upcoming: [] },
      teaching: { activeCourses: 0, totalEnrollments: 0 },
      ministries: { total: 0, totalMembers: 0 },
      planning: { activeInitiatives: 0, overdueInitiatives: 0 },
    } });
    if (path === "/api/dashboard/member-stats") return route.fulfill({ json: {
      profile: null, enrolledCourses: 0, upcomingRegisteredEvents: [], myMinistries: [], recentArticles: [],
    } });
    if (path === "/api/dashboard/leader-widgets") return route.fulfill({ json: {
      pastoral: { pending: 0, overdueFollowUps: 0 },
      counseling: { openCases: 0 },
      articles: { inReview: 0, drafts: 0 },
    } });
    return route.fulfill({ json: { notifications: [], count: 0, total: 0 } });
  });
}

for (const role of ["admin", "leader", "member"] as const) {
  test(`${role}: upcoming culto is highlighted below the greeting on desktop and mobile`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await mockDashboard(page, role);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const card = page.getByRole("region", { name: "Próximo culto", exact: true });
      await expect(card.getByRole("heading", { name: upcoming.title, exact: true })).toBeVisible();
      await expect(card.locator("time")).toHaveText("domingo, 13 de setembro de 2026 às 22:00");
      await expect(card.locator("time")).toHaveAttribute("datetime", upcoming.startDate);
      await expect(card.getByText("Horário de Brasília", { exact: true })).toBeVisible();
      await expect(card.getByText(upcoming.location, { exact: true })).toBeVisible();
      await expect(card.getByText(`Responsável: ${upcoming.responsibleName}`, { exact: true })).toBeVisible();
      for (const label of ["Santa Ceia", "Batismo", "Recepção de membros"]) {
        await expect(card.getByText(label, { exact: true })).toBeVisible();
      }
      await expect(card.getByText("Culto posterior")).toHaveCount(0);
      await expect(card.getByRole("link", { name: "Ver programação" })).toHaveAttribute("href", "/cultos/culto-test");
      await expect(card.getByRole("link", { name: "Ver todos os cultos" })).toHaveAttribute("href", "/cultos");
      await expect(card.getByRole("link", { name: "Editar culto" })).toHaveCount(role === "member" ? 0 : 1);
      if (role !== "member") await expect(card.getByRole("link", { name: "Editar culto" })).toHaveAttribute("href", "/cultos/culto-test/edit");
      await expect(card.getByRole("link", { name: "Cadastrar culto" })).toHaveCount(0);

      const greeting = page.getByRole("heading", { name: "Olá, Pessoa", exact: true });
      expect(await greeting.evaluate((element, section) => element.parentElement?.nextElementSibling === section, await card.elementHandle())).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (role === "admin") await page.screenshot({ path: testInfo.outputPath(`cultos-dashboard-${width}.png`) });

      if (width < 1024) await page.getByRole("button", { name: "Abrir menu" }).click();
      const menu = page.getByRole("navigation", { name: "Menu principal" });
      await expect(menu.getByRole("link").nth(0)).toHaveAttribute("href", "/");
      await expect(menu.getByRole("link").nth(1)).toHaveAttribute("href", "/cultos");
      await expect(menu.getByRole("link", { name: "Cultos", exact: true })).toHaveCount(1);
      await expect(menu.getByRole("link", { name: "Cultos", exact: true })).toBeInViewport();
    }
    expect(errors).toEqual([]);
  });

  test(`${role}: empty agenda only offers registration to administrators and leaders`, async ({ page }) => {
    await mockDashboard(page, role, route => route.fulfill({ json: { items: [] } }));
    await page.goto("/");
    const card = page.getByRole("region", { name: "Próximo culto", exact: true });
    await expect(card.getByRole("heading", { name: "Nenhum culto agendado" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Cadastrar culto" })).toHaveCount(role === "member" ? 0 : 1);
    if (role !== "member") await expect(card.getByRole("link", { name: "Cadastrar culto" })).toHaveAttribute("href", "/cultos/new");
    await expect(card.getByRole("link", { name: "Editar culto" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Ver programação" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Ver todos os cultos" })).toBeVisible();
  });
}

test("upcoming culto has distinct loading and error states and can retry", async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let fail = true;
  await mockDashboard(page, "admin", async route => {
    await ready;
    await route.fulfill(fail
      ? { status: 500, json: { error: "Internal server error" } }
      : { json: upcomingResponse });
  });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Próximo culto", exact: true });
  await expect(card.getByRole("status")).toHaveText("Carregando próximo culto…");
  await expect(card.getByRole("link", { name: "Cadastrar culto" })).toHaveCount(0);
  release();
  await expect(card.getByText("Não foi possível carregar o próximo culto.", { exact: true })).toBeVisible();
  await expect(card.getByText(/Internal server error|HTTP|Nenhum culto agendado/)).toHaveCount(0);
  await expect(card.getByRole("link", { name: "Cadastrar culto" })).toHaveCount(0);
  fail = false;
  await card.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(card.getByRole("heading", { name: upcoming.title, exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Tentar novamente" })).toHaveCount(0);
});

test("optional details and unselected celebrations are not invented", async ({ page }) => {
  await mockDashboard(page, "member", route => route.fulfill({ json: { items: [{
    ...upcoming, location: null, responsibleName: null,
    hasCommunion: false, hasBaptism: false, hasMemberReception: false,
  }] } }));
  await page.goto("/");
  const card = page.getByRole("region", { name: "Próximo culto", exact: true });
  await expect(card.getByRole("heading", { name: upcoming.title, exact: true })).toBeVisible();
  await expect(card.getByText(/Responsável:|Santa Ceia|Batismo|Recepção de membros|null|undefined/)).toHaveCount(0);
});

test("anonymous visitors are not sent an upcoming culto request", async ({ page }) => {
  let requests = 0;
  await mockDashboard(page, null, async route => {
    requests++;
    await route.fulfill({ json: upcomingResponse });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("region", { name: "Próximo culto" })).toHaveCount(0);
  expect(requests).toBe(0);
});
