import { test, expect } from "@playwright/test";
import { truncateAll, apiRegisterAdmin, loginAs } from "./helpers";

const P = "culto-" + Date.now().toString(36);

test.describe("23-cultos", () => {
  let adminEmail: string, adminPw: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password;
  });

  test("1. Cultos page loads", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/cultos");
    await expect(page.getByRole("heading", { name: /^cultos$/i })).toBeVisible();
  });

  test("2. New culto button visible for admin", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/cultos");
    await expect(page.getByRole("link", { name: /novo culto/i })).toBeVisible();
  });

  test("3. New culto form opens", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/cultos/new");
    await expect(page.getByText(/dados do evento/i)).toBeVisible();
    await expect(page.getByText(/elementos especiais/i)).toBeVisible();
  });

  test("4. Reports page loads", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/cultos/reports");
    await expect(page.getByText(/relatório anual/i)).toBeVisible();
  });
});
