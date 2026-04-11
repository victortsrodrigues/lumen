import { test, expect } from "@playwright/test";
import { truncateAll, loginAsNewAdmin } from "./helpers";

const P = "art-" + Date.now().toString(36);

test.describe("24-articles", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Navigate to articles", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.getByText("Artigos").click();
    await page.waitForURL(/\/articles/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Artigos");
  });

  test("2. Create article", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/articles");
    await page.getByRole("button", { name: /novo artigo/i }).click();
    await page.locator('input[type="text"]').first().fill(`Artigo ${P}`);
    await page.locator("textarea").first().fill(`Conteudo do artigo ${P} para teste.`);
    await page.locator("select").first().selectOption("devocional");
    await page.getByRole("button", { name: /criar|salvar/i }).click();
    await expect(page.getByText(/sucesso|criado/i).first()).toBeVisible({ timeout: 5000 });
  });
});
