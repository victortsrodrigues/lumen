import { test, expect } from "@playwright/test";
import { truncateAll, loginAsNewAdmin } from "./helpers";

const P = "inst-" + Date.now().toString(36);

test.describe("26-institutional", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Admin creates page", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.goto("/pages");
    await page.getByRole("button", { name: /nova página/i }).click();
    await page.locator('input[type="text"]').first().fill(`Sobre ${P}`);
    await page.locator("textarea").first().fill(`Conteúdo da página institucional ${P}.`);
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /criar|salvar/i }).click();
    await expect(page.getByText(/sucesso|criada/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("2. Public site loads without login", async ({ page }) => {
    await page.goto("/site");
    await expect(page.locator("body")).toBeVisible();
  });
});
