import { test, expect } from "@playwright/test";
import {
  truncateAll, loginAsNewAdmin, apiRegisterAdmin, apiCreateMember,
} from "./helpers";

const P = "coun-" + Date.now().toString(36);

test.describe("21-counseling", () => {
  test.beforeAll(async () => {
    await truncateAll();
  });

  test("1. Navigate to counseling module", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.getByText("Aconselhamento").click();
    await page.waitForURL(/\/counseling/);
    await expect(page.getByText("Aconselhamento Pastoral")).toBeVisible();
    await expect(page.getByText("Confidencial")).toBeVisible();
  });

  test("2. Create counseling case", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-2`);
    const member = await apiCreateMember(admin.cookie, { fullName: `Caso ${P}` });
    const counselor = await apiCreateMember(admin.cookie, { fullName: `Consel ${P}`, email: `consel-${P}@test.local` });

    await loginAsNewAdmin(page, `${P}-2b`);
    await page.goto("/counseling");

    await page.getByRole("button", { name: /novo caso/i }).click();
    await expect(page.getByText("Novo Caso de Aconselhamento")).toBeVisible();

    // Fill form
    const searchInputs = page.getByPlaceholder(/buscar/i);
    await searchInputs.first().fill(member.fullName);
    await page.waitForTimeout(500);
    await page.getByText(member.fullName).first().click();

    await searchInputs.nth(1).fill(counselor.fullName);
    await page.waitForTimeout(500);
    await page.getByText(counselor.fullName).first().click();

    await page.locator('input[type="text"]').fill("Luto familiar");
    await page.locator('input[type="date"]').fill("2026-04-01");

    await page.getByRole("button", { name: /criar caso/i }).click();
    await expect(page.getByText("Caso criado").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Open case and add session", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const member = await apiCreateMember(admin.cookie, { fullName: `Sessao ${P}` });
    const counselor = await apiCreateMember(admin.cookie, { fullName: `Consel3 ${P}`, email: `consel3-${P}@test.local` });

    // Create case via API
    const caseRes = await fetch("http://localhost:3000/api/counseling/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ memberId: member.id, counselorId: counselor.id, topic: `Sessao ${P}`, startDate: "2026-04-01" }),
    });
    const caseData = await caseRes.json();

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto(`/counseling/${caseData.id}`);

    await expect(page.getByText(`Sessao ${P}`)).toBeVisible();

    // Add session
    await page.getByRole("button", { name: /nova sessão/i }).click();
    await page.locator('input[type="date"]').fill("2026-04-05");
    await page.locator("textarea").fill("Primeira sessão");
    await page.getByRole("button", { name: /registrar/i }).click();
    await expect(page.getByText("Sessão registrada").first()).toBeVisible({ timeout: 5000 });
  });

  test("4. KPI cards visible", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-4`);
    await page.goto("/counseling");
    await page.waitForTimeout(500);

    await expect(page.getByText("Abertos")).toBeVisible();
    await expect(page.getByText("Em Andamento")).toBeVisible();
    await expect(page.getByText("Encerrados")).toBeVisible();
    await expect(page.getByText("Total Sessões")).toBeVisible();
  });
});
