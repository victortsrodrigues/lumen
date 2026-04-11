import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateMinistry, apiCreateMember, apiAddMinistryMember } from "./helpers";

const P = "e2e-min-" + Date.now().toString(36);

test.describe("11-ministries", () => {
  test("1. Listagem de ministérios carrega", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-1`);
    await apiCreateMinistry(admin.cookie, { name: `Louvor ${P}`, category: "louvor" });

    await loginAsNewAdmin(page, `${P}-1b`);
    await page.goto("/ministries");
    await expect(page.getByText(`Louvor ${P}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Ministérios").first()).toBeVisible();
  });

  test("2. Criar ministério via modal", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/ministries");
    await page.getByText("Novo Ministério").click();
    await page.locator('input').first().fill(`Ensino ${P}`);
    await page.getByRole("button", { name: /criar/i }).click();
    await expect(page.getByText("Ministério criado").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Detalhe mostra membros", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const ministry = await apiCreateMinistry(admin.cookie, { name: `Serviço ${P}`, category: "servico" });
    const member = await apiCreateMember(admin.cookie, { fullName: `Membro ${P}`, email: `m-${P}@test.local` });
    await apiAddMinistryMember(admin.cookie, ministry.id, { memberId: member.id, role: "lider" });

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto(`/ministries/${ministry.id}`);
    await expect(page.getByText(`Membro ${P}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Líder")).toBeVisible();
  });

  test("4. Sidebar tem link Ministérios", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-4`);
    await page.goto("/");
    await expect(page.getByText("Ministérios").first()).toBeVisible();
    await page.getByText("Ministérios").first().click();
    await page.waitForURL(/ministries/);
  });
});
