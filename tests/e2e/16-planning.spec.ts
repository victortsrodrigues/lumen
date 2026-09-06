import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateDirective, apiCreateObjective, apiCreateInitiative, apiRequest } from "./helpers";

const P = "e2e-plan-" + Date.now().toString(36);

test.describe("16-planning", () => {
  test("1. Dashboard de planejamento carrega", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-1`);
    await apiCreateInitiative(admin.cookie, { title: `Init ${P}`, type: "outro" });

    await loginAsNewAdmin(page, `${P}-1b`);
    await page.goto("/planning");
    await expect(page.getByText("Planejamento Estratégico")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Total Iniciativas")).toBeVisible();
  });

  test("2. Criar diretriz", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/planning/directives");
    await page.getByText("Nova Diretriz").click();

    await page.locator('input').first().fill(`Crescimento ${P}`);
    await page.getByRole("button", { name: /criar/i }).click();
    await expect(page.getByText("Diretriz criada").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Criar iniciativa", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-3`);
    await page.goto("/planning/initiatives");
    await page.getByText("Nova Iniciativa").click();

    await page.locator('input').first().fill(`Comprar Van ${P}`);
    await page.getByRole("button", { name: /criar/i }).click();
    await expect(page.getByText("Iniciativa criada").first()).toBeVisible({ timeout: 5000 });
  });

  test("4. Detalhe da iniciativa com etapas", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-4`);
    const init = await apiCreateInitiative(admin.cookie, { title: `StepTest ${P}`, type: "outro" });
    await apiRequest("POST", `/planning/initiatives/${init.id}/steps`, {
      title: "Etapa para concluir",
      sortOrder: 1,
    }, admin.cookie);

    await loginAsNewAdmin(page, `${P}-4b`);
    await page.goto("/planning/initiatives");
    await page.getByText(`StepTest ${P}`).click();
    await expect(page.getByText("Etapa para concluir")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("concluído")).toBeVisible();
  });

  test("5. Sidebar tem link Planejamento", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-5`);
    await page.goto("/");
    await expect(page.getByText("Planejamento")).toBeVisible({ timeout: 5000 });
    await page.getByText("Planejamento").click();
    await page.waitForURL(/planning/);
  });
});
