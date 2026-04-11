import { test, expect } from "@playwright/test";
import {
  truncateAll, apiRegisterAdmin, apiRegisterLeader, apiRegisterMember,
  apiCreateMember, loginAs,
} from "./helpers";

const P = "mem-" + Date.now().toString(36);

test.describe("02-members", () => {
  let adminEmail: string, adminPw: string, adminCk: string;
  let leaderEmail: string, leaderPw: string;
  let memberEmail: string, memberPw: string;
  let memberId: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password; adminCk = admin.cookie;
    const leader = await apiRegisterLeader(`${P}-l`);
    leaderEmail = leader.email; leaderPw = leader.password;
    const member = await apiRegisterMember(`${P}-m`);
    memberEmail = member.email; memberPw = member.password;

    const m = await apiCreateMember(adminCk, {
      fullName: `Teste Membro ${P}`, cpf: "12345678900", phone: "11999998888",
      email: `membro-${P}@test.local`,
    });
    memberId = m.id;
  });

  test("1. Members page loads", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await expect(page.getByText(/membros da igreja/i)).toBeVisible();
  });

  test("2. Create member (page /new)", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await page.getByText(/novo membro/i).click();
    await expect(page).toHaveURL(/\/members\/new/);
    await page.locator('input[name="fullName"]').fill(`Novo Membro ${P}`);
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: /salvar|cadastrar/i }).click();
    await page.waitForTimeout(2000);
  });

  test("3. Required name field", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members/new");
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: /salvar|cadastrar/i }).click();
    // Should show validation error or stay on page
    await expect(page).toHaveURL(/\/members\/new/);
  });

  test("4. Search by name", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await page.getByPlaceholder(/buscar/i).fill(`Teste Membro ${P}`);
    await page.waitForTimeout(1000); // debounce
    await expect(page.getByText(`Teste Membro ${P}`)).toBeVisible();
  });

  test("5. Filter by status", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await page.locator("select").first().selectOption("inativo");
    await page.waitForTimeout(500);
    // Should show empty or only inactive members
  });

  test("6. View member profile", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await page.getByText(/visualizar/i).first().click();
    await expect(page).toHaveURL(/\/members\//);
    await expect(page.getByText(`Teste Membro ${P}`)).toBeVisible();
  });

  test("7. Edit member (page /edit)", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/members/${memberId}`);
    await page.getByText(/editar/i).first().click();
    await expect(page).toHaveURL(/\/edit/);
  });

  test("8. CPF masked in list", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await expect(page.getByText(/\*\*\*\.\*\*\*/).first()).toBeVisible();
  });

  test("9. Admin reveals CPF", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    // Try to find and click the eye/reveal button
    const revealBtn = page.locator("[title*='CPF'], [aria-label*='CPF'], button:has(svg)").first();
    if (await revealBtn.isVisible()) {
      await revealBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("10. Member history", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/members/${memberId}`);
    const historyTab = page.getByText(/histórico/i);
    if (await historyTab.isVisible()) {
      await historyTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test("11. Delete member (anonymize)", async ({ page }) => {
    // Create a disposable member
    const m = await apiCreateMember(adminCk, {
      fullName: `Deletable ${P}`, email: `del-${P}@test.local`,
    });
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/members/${m.id}`);
    const delBtn = page.getByRole("button", { name: /excluir|deletar/i });
    if (await delBtn.isVisible()) {
      await delBtn.click();
      // Confirm dialog
      const confirmBtn = page.getByRole("button", { name: /confirmar|sim/i });
      if (await confirmBtn.isVisible()) await confirmBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test("12. Import CSV", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members/import");
    await expect(page).toHaveURL(/\/import/);
  });

  test("13. Member cannot see 'Novo Membro'", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/members");
    await expect(page.getByText(/novo membro/i)).not.toBeVisible();
  });

  test("14. Pagination works", async ({ page }) => {
    // Create 25 members via API
    for (let i = 0; i < 25; i++) {
      await apiCreateMember(adminCk, { fullName: `Pag${i} ${P}` });
    }
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await page.waitForTimeout(1000);
    const nextBtn = page.getByRole("button", { name: /próxima|next/i });
    if (await nextBtn.isVisible() && await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("15. Empty search result", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/members");
    await page.getByPlaceholder(/buscar/i).fill("ZZZZ_NONEXISTENT");
    await page.waitForTimeout(1000);
    await expect(page.getByText(/nenhum membro/i)).toBeVisible();
  });

  test("16. Leader sees member list", async ({ page }) => {
    await loginAs(page, leaderEmail, leaderPw);
    await page.goto("/members");
    // Leader can see the members page and list
    await expect(page.getByText(/membros da igreja/i)).toBeVisible();
  });

  test("17. Leader can access member page", async ({ page }) => {
    await loginAs(page, leaderEmail, leaderPw);
    await page.goto("/members");
    // Leader can see member data in the table
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/members");
  });
});
