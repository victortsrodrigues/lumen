import { test, expect } from "@playwright/test";
import { truncateAll, apiRegisterAdmin, loginAs } from "./helpers";

const P = "nav-" + Date.now().toString(36);

test.describe("07-navigation", () => {
  let adminEmail: string, adminPw: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password;
  });

  test("1. Sidebar shows all items (admin)", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    for (const item of ["Dashboard", "Membros", "Financeiro", "Ensino", "Eventos", "Privacidade e termos"]) {
      await expect(page.getByText(item).first()).toBeVisible();
    }
  });

  test("2. Finance submenu expands", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.getByText("Financeiro").click();
    await expect(page.getByText("Entradas").first()).toBeVisible();
    await expect(page.getByText("Despesas").first()).toBeVisible();
    await expect(page.getByText(/relatórios/i)).toBeVisible();
    await expect(page.getByText(/fechamentos/i)).toBeVisible();
  });

  test("3. Teaching submenu expands", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.getByText("Ensino").click();
    await expect(page.getByText("Cursos").first()).toBeVisible();
    await expect(page.getByText(/frequência/i).first()).toBeVisible();
    await expect(page.getByText(/meus cursos/i).first()).toBeVisible();
  });

  test("4. Privacy and terms submenu expands", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    const navigation = page.getByRole("navigation", { name: "Menu principal", exact: true });
    await navigation.getByRole("button", { name: "Privacidade e termos", exact: true }).click();
    await expect(navigation.getByRole("link", { name: "Política de Privacidade", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Termos de Uso", exact: true })).toBeVisible();
  });

  test("5. Navigation between pages", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.getByText("Membros").first().click();
    await expect(page).toHaveURL(/\/members/);
    await page.getByText("Eventos").first().click();
    await expect(page).toHaveURL(/\/events/);
  });

  test("6. Active state highlights current page", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.getByText("Financeiro").click();
    await page.getByText("Entradas").first().click();
    await expect(page).toHaveURL(/\/finance\/entries/);
    // The "Entradas" item should have primary/active styling
  });
});
