import { test, expect, type Page } from "@playwright/test";

const PIX_KEY = "presbiterianalumen@gmail.com";

async function mockSession(page: Page, role: "admin" | "leader" | "member" | null) {
  const paymentRequests: string[] = [];
  await page.route(/^https:\/\//, route => route.abort());
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/pix")) {
      paymentRequests.push(path);
      return route.fulfill({ status: 404, json: { error: "PIX_NOT_CONFIGURED" } });
    }
    if (path === "/api/auth/me") {
      return role
        ? route.fulfill({ json: { id: "account-test", name: "Pessoa de Teste", email: "person@example.test", role, status: "active", memberId: null, mfaEnabled: false } })
        : route.fulfill({ status: 401, json: { error: "UNAUTHORIZED" } });
    }
    return route.fulfill({ json: { notifications: [], count: 0, total: 0 } });
  });
  return paymentRequests;
}

for (const role of ["admin", "leader", "member"] as const) {
  test(`${role}: contributions show the supplied details without a QR code or payment API`, async ({ page }) => {
    const paymentRequests = await mockSession(page, role);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => { document.documentElement.dataset.copiedPixKey = value; },
        },
      });
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/contributions");
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: "Contribuições", exact: true })).toBeVisible();
      await expect(main.getByText("Dízimos e ofertas", { exact: true })).toBeVisible();
      await expect(main.getByText(PIX_KEY, { exact: true })).toBeVisible();
      await expect(main.getByText("PRESBITÉRIO DE JUIZ DE FORA", { exact: true })).toBeVisible();
      await expect(main.getByText("CC CREDICAF LTDA", { exact: true })).toBeVisible();
      await expect(main.locator("img, canvas, input")).toHaveCount(0);
      await expect(main.getByText(/QR code|Cidade|PIX_NOT_CONFIGURED/i)).toHaveCount(0);
      const copy = main.getByRole("button", { name: "Copiar chave Pix", exact: true });
      await copy.focus();
      await copy.press("Enter");
      await expect(copy).toHaveText("Copiada!");
      await expect(page.locator("html")).toHaveAttribute("data-copied-pix-key", PIX_KEY);
      await expect(page).toHaveURL(/\/contributions$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    expect(paymentRequests).toEqual([]);
  });
}

test("contributions keep the Pix key readable when clipboard access is denied", async ({ page }) => {
  const paymentRequests = await mockSession(page, "member");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("NotAllowedError"); } },
    });
  });
  await page.goto("/contributions");
  await page.getByRole("button", { name: "Copiar chave Pix", exact: true }).click();
  await expect(page.getByText("Selecione a chave Pix e copie manualmente.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText(PIX_KEY, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar chave Pix", exact: true })).toHaveText("Copiar chave");
  await expect(page.getByText("NotAllowedError", { exact: true })).toHaveCount(0);
  expect(paymentRequests).toEqual([]);
});

test("contributions still require login", async ({ page }) => {
  const paymentRequests = await mockSession(page, null);
  await page.goto("/contributions");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(PIX_KEY, { exact: true })).toHaveCount(0);
  expect(paymentRequests).toEqual([]);
});
