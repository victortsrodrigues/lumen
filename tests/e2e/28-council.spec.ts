import { test, expect } from "@playwright/test";
import { truncateAll, apiRegisterAdmin, loginAs } from "./helpers";

const P = "council-" + Date.now().toString(36);

test.describe("28-council", () => {
  let adminEmail: string, adminPw: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password;
  });

  test("1. Conselho page loads for admin", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/conselho");
    await expect(page.getByRole("heading", { name: /^conselho$/i })).toBeVisible();
  });

  test("2. New meeting form visible for admin", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/conselho");
    await expect(page.getByRole("link", { name: /nova reunião/i })).toBeVisible();
  });

  test("3. New meeting form has expected fields", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/conselho/new");
    await expect(page.getByText(/dados da reunião/i)).toBeVisible();
    await expect(page.getByText(/ata da reunião/i)).toBeVisible();
  });
});
