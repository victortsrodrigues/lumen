import { test, expect } from "@playwright/test";
import { truncateAll, loginAsNewAdmin } from "./helpers";

const P = "song-" + Date.now().toString(36);

test.describe("22-songs", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Navigate to songs", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.getByText("Músicas").click();
    await page.waitForURL(/\/songs/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Músicas");
  });

  test("2. Create song", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/songs");
    await page.getByRole("button", { name: /nova música/i }).click();
    await page.locator('input[type="text"]').first().fill("Grande é o Senhor");
    await page.locator("select").first().selectOption("louvor");
    await page.getByRole("button", { name: /criar|salvar/i }).click();
    await expect(page.getByText(/sucesso/i).first()).toBeVisible({ timeout: 5000 });
  });
});
