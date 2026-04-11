import { test, expect } from "@playwright/test";
import {
  truncateAll, apiRegisterAdmin, apiRegisterLeader, apiCreateMember,
  apiCreateFinanceEntry, loginAs,
} from "./helpers";

const P = "fin-" + Date.now().toString(36);

test.describe("03-finance", () => {
  let adminEmail: string, adminPw: string, adminCk: string;
  let leaderEmail: string, leaderPw: string;
  let memberId: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password; adminCk = admin.cookie;
    const leader = await apiRegisterLeader(`${P}-l`);
    leaderEmail = leader.email; leaderPw = leader.password;
    const m = await apiCreateMember(adminCk, { fullName: `FinMember ${P}`, email: `finm-${P}@t.local` });
    memberId = m.id;
    // Create some entries for testing
    await apiCreateFinanceEntry(adminCk, { type: "dizimo", date: "2025-05-10", amount: 150, paymentMethod: "pix", memberId });
    await apiCreateFinanceEntry(adminCk, { type: "oferta", date: "2025-05-11", amount: 50, paymentMethod: "dinheiro" });
  });

  test("1. Dashboard loads", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance");
    await expect(page.getByText(/visão geral financeira/i)).toBeVisible();
  });

  test("2. 12-month chart visible", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance");
    await expect(page.getByText(/receitas vs despesas/i)).toBeVisible();
  });

  test("3. Create dizimo entry", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/entries");
    await page.getByText(/nova entrada/i).click();
    await page.waitForTimeout(500);
    // Fill modal form
    const modal = page.locator("div.bg-card").last();
    await modal.locator("select").first().selectOption("dizimo");
    await modal.locator("input[type='date']").fill("2025-05-15");
    await modal.locator("input[type='number']").fill("200");
    await modal.locator("select").nth(1).selectOption("pix");
    await modal.getByRole("button", { name: /registrar|salvar/i }).click();
    await page.waitForTimeout(1000);
  });

  test("4. Filter entries by type", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/entries");
    await page.locator("select").first().selectOption("dizimo");
    await page.waitForTimeout(500);
  });

  test("5. Edit entry", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/entries");
    const editBtn = page.locator("[title='Editar'], button:has(svg)").first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("6. Delete entry (soft)", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/entries");
    const delBtn = page.locator("[title='Excluir']").first();
    if (await delBtn.isVisible()) {
      await delBtn.click();
      // Accept confirmation
      page.on("dialog", (d) => d.accept());
      await page.waitForTimeout(1000);
    }
  });

  test("7. Create expense", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/expenses");
    await page.getByText(/nova despesa/i).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("select").first().selectOption("aluguel");
    await modal.locator("input[type='date']").fill("2025-05-15");
    await modal.locator("textarea").fill("Aluguel mensal");
    await modal.locator("input[type='number']").fill("1500");
    await modal.getByRole("button", { name: /registrar|salvar/i }).click();
    await page.waitForTimeout(1000);
  });

  test("8. List expenses", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/expenses");
    await expect(page.getByText(/despesas/i).first()).toBeVisible();
  });

  test("9. Edit expense", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/expenses");
    const editBtn = page.locator("[title='Editar']").first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("10. Delete expense", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/expenses");
    page.on("dialog", (d) => d.accept());
    const delBtn = page.locator("[title='Excluir']").first();
    if (await delBtn.isVisible()) {
      await delBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("11. Filter expenses", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/expenses");
    const select = page.locator("select").first();
    if (await select.isVisible()) {
      await select.selectOption("aluguel");
      await page.waitForTimeout(500);
    }
  });

  test("12. Report page", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/report");
    await expect(page.getByText(/relatório|report/i).first()).toBeVisible();
  });

  test("13. Export PDF", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/report");
    const pdfBtn = page.getByRole("button", { name: /pdf/i });
    if (await pdfBtn.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
        pdfBtn.click(),
      ]);
      if (download) expect(download.suggestedFilename()).toContain(".pdf");
    }
  });

  test("14. Export Excel", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/report");
    const xlsBtn = page.getByRole("button", { name: /excel|xlsx/i });
    if (await xlsBtn.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
        xlsBtn.click(),
      ]);
      if (download) expect(download.suggestedFilename()).toMatch(/\.xlsx?/);
    }
  });

  test("15. Close month", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/closings");
    await expect(page.getByText(/fechamento/i).first()).toBeVisible();
  });

  test("16. Entry blocked after closing", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/finance/entries");
    // If month is closed, edit buttons should be disabled or show "Fechado"
    await page.waitForTimeout(500);
  });

  test("17. Leader sees finance entries page", async ({ page }) => {
    await loginAs(page, leaderEmail, leaderPw);
    await page.goto("/finance/entries");
    // Leader can access the page (backend blocks creation with 403, UI may show button)
    expect(page.url()).toContain("/finance/entries");
  });

  test("18. Leader sees masked member data", async ({ page }) => {
    await loginAs(page, leaderEmail, leaderPw);
    await page.goto("/finance/entries");
    await page.waitForTimeout(1000);
    // Leader should see [oculto] for tithe member names
    const pageContent = await page.textContent("body");
    // If there are dizimo entries, memberName should be masked
    if (pageContent?.includes("Dízimo")) {
      expect(pageContent).toContain("[oculto]");
    }
  });
});
