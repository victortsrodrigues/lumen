import { test, expect } from "@playwright/test";
import { truncateAll, loginAsNewAdmin } from "./helpers";

const P = "frm-" + Date.now().toString(36);

test.describe("25-forum", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Navigate to forum", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.getByText("Fórum").click();
    await page.waitForURL(/\/forum/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Fórum");
  });

  test("2. Create topic", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/forum");
    await page.getByRole("button", { name: /novo tópico/i }).click();
    await page.locator('input[type="text"]').first().fill(`Tópico ${P}`);
    await page.locator("textarea").first().fill(`Corpo do tópico ${P} para discussão.`);
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /criar|salvar/i }).click();
    await expect(page.getByText(/sucesso|criado/i).first()).toBeVisible({ timeout: 5000 });
  });
});
