import { test, expect } from "@playwright/test";
import { truncateAll, loginAsNewAdmin } from "./helpers";

const P = "lit-" + Date.now().toString(36);

test.describe("23-liturgy", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Navigate to liturgy", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.getByText("Liturgia").click();
    await page.waitForURL(/\/liturgy/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Liturgia");
  });

  test("2. Create liturgy", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/liturgy");
    await page.getByRole("button", { name: /nova liturgia/i }).click();
    await page.locator('input[type="text"]').first().fill(`Culto ${P}`);
    await page.locator('input[type="date"]').fill("2026-05-01");
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /criar|salvar/i }).click();
    await expect(page.getByText(/sucesso|criada/i).first()).toBeVisible({ timeout: 5000 });
  });
});
