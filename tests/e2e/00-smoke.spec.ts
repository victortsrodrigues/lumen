import { test, expect } from "@playwright/test";

test.describe("00-smoke", () => {
  test("1. Login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("seu@email.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
  });

  test("2. Register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByPlaceholder("João Silva")).toBeVisible();
    await expect(page.getByText(/concordo com o processamento/i)).toBeVisible();
  });

  test("3. Redirect without auth", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });

  test("4. Unknown URL redirects to login", async ({ page }) => {
    await page.goto("/xyz-nonexistent");
    // Without auth, unknown routes redirect to login
    await page.waitForURL(/\/login/, { timeout: 5000 });
    expect(page.url()).toContain("/login");
  });
});
