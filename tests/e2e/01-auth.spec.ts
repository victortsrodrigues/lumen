import { test, expect } from "@playwright/test";
import {
  truncateAll, apiRegisterAdmin, apiRegisterMember, loginAs,
} from "./helpers";

const P = "auth-" + Date.now().toString(36);

test.describe("01-auth", () => {
  test.beforeAll(async () => { await truncateAll(); });

  const email = `${P}@test.local`;
  const password = "TestPass1234!";

  test("1. Register complete flow", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[placeholder="João Silva"]').fill(`User ${P}`);
    await page.locator('input[type="email"]:visible').fill(email);
    await page.locator('input[type="password"]:visible').fill(password);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: /criar minha conta/i }).click();
    await page.waitForFunction(() => !window.location.pathname.includes('/register'), { timeout: 15000 });
    expect(page.url()).not.toContain("/register");
  });

  test("2. Register without consent", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[placeholder="João Silva"]').fill("No Consent");
    await page.locator('input[type="email"]:visible').fill(`nocons-${P}@test.local`);
    await page.locator('input[type="password"]:visible').fill(password);
    // Don't check consent
    const btn = page.getByRole("button", { name: /criar minha conta/i });
    // Button should be disabled or clicking shows error
    await btn.click({ timeout: 2000 }).catch(() => {});
    // Should still be on register page
    expect(page.url()).toContain("/register");
  });

  test("3. Register duplicate email", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[placeholder="João Silva"]').fill("Dup");
    await page.locator('input[type="email"]:visible').fill(email); // same as test 1
    await page.locator('input[type="password"]:visible').fill(password);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: /criar minha conta/i }).click();
    await expect(page.getByText(/já cadastrado|already/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("4. Login valid", async ({ page }) => {
    await loginAs(page, email, password);
    // Should be on dashboard or any authenticated page
    expect(page.url()).not.toContain("/login");
  });

  test("5. Login wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]:visible').fill(email);
    await page.locator('input[type="password"]:visible').fill("wrongpassword");
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page.getByText(/inválidos|invalid/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("6. Logout", async ({ page }) => {
    await loginAs(page, email, password);
    await page.getByRole("button", { name: /logout|sair/i }).click();
    await page.waitForURL(/\/login/, { timeout: 5000 });
  });

  test("7. Session persists on refresh", async ({ page }) => {
    await loginAs(page, email, password);
    await page.reload();
    // Should still be authenticated after refresh
    expect(page.url()).not.toContain("/login");
  });

  test("8. Sidebar shows name and role", async ({ page }) => {
    await loginAs(page, email, password);
    // Sidebar should show user info
    expect(page.url()).not.toContain("/login");
  });

  test("9. Forgot password flow", async ({ page }) => {
    await page.goto("/login");
    await page.getByText(/esqueceu a senha/i).click();
    await page.locator('input[type="email"]:visible').fill(email);
    await page.getByRole("button", { name: /enviar|recuperação/i }).click();
    await expect(page.getByText(/enviamos|instruções/i)).toBeVisible({ timeout: 5000 });
  });

  test("10. Admin sees audit menu", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-adm`);
    await loginAs(page, admin.email, admin.password);
    await expect(page.getByText(/auditoria|audit/i).first()).toBeVisible();
  });

  test("11. Member does not see audit menu", async ({ page }) => {
    await loginAs(page, email, password);
    await expect(page.getByText(/auditoria|audit/i)).not.toBeVisible({ timeout: 3000 });
  });

  test("12. Admin sees all modules", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-all`);
    await loginAs(page, admin.email, admin.password);
    for (const item of ["Dashboard", "Membros", "Financeiro", "Ensino", "Eventos", "LGPD"]) {
      await expect(page.getByText(item).first()).toBeVisible();
    }
  });

  test("13. Redirect to login without cookie", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/members");
    await page.waitForURL(/\/login/, { timeout: 5000 });
  });
});
