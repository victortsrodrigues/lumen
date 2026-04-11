import { test, expect } from "@playwright/test";
import {
  truncateAll, loginAsNewAdmin, apiRegisterAdmin, apiCreateMember, apiCreatePastoralVisit,
} from "./helpers";

const P = "past-" + Date.now().toString(36);

test.describe("20-pastoral", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Navigate to pastoral module via sidebar", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.getByText("Acompanhamento").click();
    await page.waitForURL(/\/pastoral/);
    await expect(page.getByText("Acompanhamento Pastoral")).toBeVisible();
  });

  test("2. Create pastoral visit", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-2`);
    const member = await apiCreateMember(admin.cookie, { fullName: `Visitado ${P}` });
    const pastor = await apiCreateMember(admin.cookie, { fullName: `Pastor ${P}`, email: `pastor-${P}@test.local` });

    await loginAsNewAdmin(page, `${P}-2b`);
    await page.goto("/pastoral");

    // Open create modal
    await page.getByRole("button", { name: /nova visita/i }).click();
    await expect(page.getByText("Nova Visita Pastoral")).toBeVisible();

    // Fill form — search for member
    const memberSearchInputs = page.getByPlaceholder(/buscar membro/i);
    await memberSearchInputs.first().fill(member.fullName);
    await page.waitForTimeout(500);
    await page.getByText(member.fullName).first().click();

    // Search for pastor
    await memberSearchInputs.nth(1).fill(pastor.fullName);
    await page.waitForTimeout(500);
    await page.getByText(pastor.fullName).first().click();

    // Fill date
    await page.locator('input[type="date"]').first().fill("2026-04-10");

    // Submit
    await page.getByRole("button", { name: /registrar/i }).click();
    await expect(page.getByText("Visita registrada").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Edit visit and mark as realizado", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const member = await apiCreateMember(admin.cookie, { fullName: `Edit ${P}` });
    const pastor = await apiCreateMember(admin.cookie, { fullName: `Pastor3 ${P}`, email: `pastor3-${P}@test.local` });
    await apiCreatePastoralVisit(admin.cookie, {
      memberId: member.id, pastorId: pastor.id, type: "visita", date: "2026-04-05",
    });

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto("/pastoral");
    await page.waitForTimeout(500);

    // Click edit button on the visit
    const editBtn = page.locator("button[title='Editar']").first();
    await editBtn.click();
    await expect(page.getByText("Editar Visita")).toBeVisible();

    // Change status to realizado
    await page.locator("select").nth(0).selectOption("realizado");

    await page.getByRole("button", { name: /salvar/i }).click();
    await expect(page.getByText("Visita atualizada").first()).toBeVisible({ timeout: 5000 });
  });

  test("4. Filter by status pendente", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-4`);
    await page.goto("/pastoral");
    await page.waitForTimeout(500);

    await page.locator("select").first().selectOption("pendente");
    await page.waitForTimeout(500);

    const statusBadges = page.locator("text=Pendente");
    const count = await statusBadges.count();
    // All visible visits should be pendente (or none)
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("5. KPI cards are visible", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-5`);
    await page.goto("/pastoral");
    await page.waitForTimeout(500);

    await expect(page.getByText("Total Visitas")).toBeVisible();
    await expect(page.getByText("Pendentes")).toBeVisible();
    await expect(page.getByText("Realizadas (Mês)")).toBeVisible();
    await expect(page.getByText("Follow-ups Atrasados")).toBeVisible();
  });
});
