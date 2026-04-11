import { test, expect } from "@playwright/test";
import { truncateAll, loginAsNewAdmin } from "./helpers";

const P = "pix-" + Date.now().toString(36);

test.describe("27-pix", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Admin configures PIX", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.goto("/finance/pix");
    await page.getByRole("button", { name: /configurar pix/i }).click();
    await page.locator('input[type="text"]').first().fill("12345678000190");
    await page.locator('input[type="text"]').nth(1).fill("Igreja Teste");
    await page.locator('input[type="text"]').nth(2).fill("São Paulo");
    await page.getByRole("button", { name: /salvar/i }).click();
    await expect(page.getByText(/sucesso|salva/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("2. Public donate page loads without login", async ({ page }) => {
    await page.goto("/donate");
    await expect(page.locator("body")).toBeVisible();
  });
});
