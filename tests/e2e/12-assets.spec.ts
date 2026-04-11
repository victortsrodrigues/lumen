import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateAsset } from "./helpers";

const P = "e2e-ast-" + Date.now().toString(36);

test.describe("12-assets", () => {
  test("1. Listagem de patrimônio carrega", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-1`);
    await apiCreateAsset(admin.cookie, { name: `Teclado ${P}`, location: "Sala 1", category: "instrumento" });

    await loginAsNewAdmin(page, `${P}-1b`);
    await page.goto("/assets");
    await expect(page.getByText(`Teclado ${P}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Patrimônio").first()).toBeVisible();
  });

  test("2. Criar bem via modal", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/assets");
    await page.getByText("Novo Bem").click();
    await page.getByPlaceholder("Teclado Yamaha PSR-S975").fill(`Mesa ${P}`);
    await page.getByPlaceholder("Sala de Ensaio").fill("Depósito");
    await page.getByRole("button", { name: /criar/i }).click();
    await expect(page.getByText("Bem cadastrado").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Summary mostra total e valor", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    await apiCreateAsset(admin.cookie, { name: `Van ${P}`, location: "Garage", acquisitionValue: "50000.00" });

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto("/assets");
    await expect(page.getByText("Total de Bens")).toBeVisible({ timeout: 10000 });
  });
});
