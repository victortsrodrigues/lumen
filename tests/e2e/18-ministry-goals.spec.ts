import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateMinistry, apiCreateMinistryGoal, apiRequest } from "./helpers";

const P = "e2e-goal-" + Date.now().toString(36);

test.describe("18-ministry-goals", () => {
  test("1. Seção Metas aparece no detalhe do ministério", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-1`);
    const ministry = await apiCreateMinistry(admin.cookie, { name: `GoalMin ${P}`, category: "louvor" });
    await apiCreateMinistryGoal(admin.cookie, ministry.id, { title: `5 músicos ${P}`, targetValue: 5, unit: "músicos" });

    await loginAsNewAdmin(page, `${P}-1b`);
    await page.goto(`/ministries/${ministry.id}`);
    await expect(page.getByText("Metas")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`5 músicos ${P}`)).toBeVisible();
  });

  test("2. Criar meta via modal", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-2`);
    const ministry = await apiCreateMinistry(admin.cookie, { name: `GoalMin2 ${P}`, category: "ensino" });

    await loginAsNewAdmin(page, `${P}-2b`);
    await page.goto(`/ministries/${ministry.id}`);
    await page.getByText("Nova Meta").click();
    await page.locator('input').first().fill(`10 alunos ${P}`);
    // Target value
    await page.locator('input[type="number"]').first().fill("10");
    await page.getByRole("button", { name: /criar/i }).click();
    await expect(page.getByText("Meta criada").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Barra de progresso visível", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const ministry = await apiCreateMinistry(admin.cookie, { name: `GoalMin3 ${P}`, category: "servico" });
    const goal = await apiCreateMinistryGoal(admin.cookie, ministry.id, { title: `3 ações ${P}`, targetValue: 10 });
    // Update currentValue via API
    await apiRequest("PUT", `/ministries/${ministry.id}/goals/${goal.id}`, {
      currentValue: 5,
    }, admin.cookie);

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto(`/ministries/${ministry.id}`);
    await expect(page.getByText(`3 ações ${P}`)).toBeVisible({ timeout: 10000 });
    // Progress bar should show percentage (5/10 = 50%)
    await expect(page.getByText("50%").first()).toBeVisible();
  });
});
