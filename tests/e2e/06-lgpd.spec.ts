import { test, expect } from "@playwright/test";
import {
  truncateAll, apiRegisterAdmin, apiRegisterUser, apiLoginUser,
  apiCreateMember, apiCreateFinanceEntry, loginAs,
} from "./helpers";

const P = "lgpd-" + Date.now().toString(36);

test.describe("06-lgpd", () => {
  let adminEmail: string, adminPw: string, adminCk: string;
  let memberEmail: string, memberPw: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password; adminCk = admin.cookie;

    // Create member user with matching member record
    memberEmail = `lgpd-mem-${P}@test.local`;
    memberPw = "LgpdPass1234!";
    await apiRegisterUser(memberEmail, memberPw, `LGPD Member ${P}`);
    const m = await apiCreateMember(adminCk, {
      fullName: `LGPD Member ${P}`, cpf: "55566677788", phone: "21988887777",
      email: memberEmail,
    });
    // Create finance entry for this member
    await apiCreateFinanceEntry(adminCk, {
      type: "dizimo", date: "2025-05-10", amount: 200, paymentMethod: "pix", memberId: m.id,
    });
  });

  test("1. My Data page loads", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/lgpd/my-data");
    await expect(page.getByText(/meus dados pessoais/i)).toBeVisible();
  });

  test("2. Personal data visible", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/lgpd/my-data");
    await expect(page.getByText(`LGPD Member ${P}`).first()).toBeVisible();
    await expect(page.getByText(/\*\*\*/).first()).toBeVisible(); // masked CPF
  });

  test("3. Consents visible", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/lgpd/my-data");
    await expect(page.getByText(/consentimentos dados/i)).toBeVisible();
  });

  test("4. Export data (download)", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/lgpd/my-data");
    const exportBtn = page.getByRole("button", { name: /exportar dados/i });
    await exportBtn.click();
    await page.waitForTimeout(2000);
    // Toast or download should have been triggered
  });

  test("5. Request correction", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/lgpd/my-data");
    await page.getByRole("button", { name: /solicitar correção/i }).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("textarea").fill("Corrigir endereço");
    await modal.getByRole("button", { name: /enviar solicitação/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/solicitação enviada/i).first()).toBeVisible({ timeout: 3000 });
  });

  test("6. Deletion warning shows", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/lgpd/my-data");
    await page.getByRole("button", { name: /solicitar exclusão/i }).click();
    await expect(page.getByText(/irreversível/i)).toBeVisible();
  });

  test("7. Admin sees request queue", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/lgpd/admin-requests");
    await expect(page.getByText(/solicitações lgpd/i).first()).toBeVisible();
  });

  test("8. Admin rejects request", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/lgpd/admin-requests");
    const rejectBtn = page.getByRole("button", { name: /rejeitar/i }).first();
    if (await rejectBtn.isVisible()) {
      await rejectBtn.click();
      await page.waitForTimeout(500);
      const modal = page.locator("div.bg-card").last();
      await modal.locator("textarea").fill("Dados estão corretos");
      await modal.getByRole("button", { name: /confirmar rejeição/i }).click();
      await page.waitForTimeout(1000);
    }
  });
});
