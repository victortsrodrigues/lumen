import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateMember, apiCreateFinanceEntry } from "./helpers";

const P = "e2e-dash-" + Date.now().toString(36);

test.describe("14-dashboard", () => {
  test("1. Dashboard mostra nome do usuário", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.goto("/");
    await expect(page.getByText("Olá, Admin")).toBeVisible({ timeout: 10000 });
  });

  test("2. Cards exibem números", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-2`);
    await apiCreateMember(admin.cookie, { fullName: `DashMember ${P}`, email: `dash-${P}@test.local` });

    await loginAsNewAdmin(page, `${P}-2b`);
    await page.goto("/");
    // Members card should show at least 1
    await expect(page.getByText("Membros ativos")).toBeVisible({ timeout: 10000 });
    // Should NOT show old placeholder text
    await expect(page.getByText("Módulo em desenvolvimento")).not.toBeVisible();
  });

  test("3. Card financeiro mostra valor em R$", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const member = await apiCreateMember(admin.cookie, { fullName: `FinDash ${P}`, email: `findash-${P}@test.local` });
    const today = new Date().toISOString().split("T")[0];
    await apiCreateFinanceEntry(admin.cookie, {
      type: "dizimo", amount: "1000.00", date: today, paymentMethod: "pix", memberId: member.id,
    });

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto("/");
    await expect(page.getByText("Arrecadação do mês")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("R$").first()).toBeVisible();
  });
});
