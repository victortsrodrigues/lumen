import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateBudget, apiAddBudgetItems } from "./helpers";

const P = "e2e-bud-" + Date.now().toString(36);

test.describe("15-budget", () => {
  test("1. Página de orçamento carrega", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.goto("/finance/budget");
    await expect(page.getByText("Orçamento").first()).toBeVisible({ timeout: 10000 });
  });

  test("2. Criar orçamento", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/finance/budget");
    await page.getByText("Novo Orçamento").click();
    // Budget should be created for selected year
    await expect(page.getByText("Orçamento criado").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Página de comparativo carrega", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const year = String(new Date().getFullYear());
    const budget = await apiCreateBudget(admin.cookie, { year });
    await apiAddBudgetItems(admin.cookie, budget.id, [
      { type: "receita", category: "dizimo", month: "03", plannedAmount: "5000" },
    ]);

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto("/finance/budget/comparison");
    await expect(page.getByText("Orçado vs. Realizado")).toBeVisible({ timeout: 10000 });
  });

  test("4. Sidebar tem links de orçamento", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-4`);
    await page.goto("/");
    // Expand Finance menu
    await page.getByText("Financeiro").click();
    await expect(page.getByText("Orçamento")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Orçado vs. Real")).toBeVisible();
  });
});
