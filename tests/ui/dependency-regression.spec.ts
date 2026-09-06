import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const webRequire = createRequire(
  resolve(process.cwd(), "artifacts/church-erp/package.json"),
);
const XLSX = webRequire("xlsx");

for (const empty of [false, true]) {
  test(`financial Excel export preserves ${empty ? "empty reports" : "amounts, dates, accents and literal text"}`, async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path === "/api/auth/me")
        body = {
          id: "admin-test",
          name: "Admin",
          email: "admin@example.test",
          role: "admin",
          status: "active",
          mfaEnabled: false,
        };
      else if (path === "/api/finance/report")
        body = {
          totalEntries: empty ? "0" : "1250.75",
          totalExpenses: empty ? "0" : "50.25",
          balance: empty ? "0" : "1200.50",
          entries: empty
            ? []
            : [
                {
                  id: "entry-1",
                  type: "dizimo",
                  date: "2026-09-06T12:00:00Z",
                  amount: "1250.75",
                  paymentMethod: "pix",
                  memberName: "João — Missões",
                  isAnonymous: false,
                  createdAt: "2026-09-06T12:00:00Z",
                },
              ],
          expenses: empty
            ? []
            : [
                {
                  id: "expense-1",
                  category: "agua",
                  date: "2026-09-06T12:00:00Z",
                  amount: "50.25",
                  description: "=1+1",
                  createdAt: "2026-09-06T12:00:00Z",
                },
              ],
        };
      else if (path.includes("notifications"))
        body = { count: 0, notifications: [], total: 0 };
      await route.fulfill({ json: body });
    });
    await page.goto("/finance/report");
    const button = page.getByRole("button", { name: /Excel/i });
    if (empty) {
      await expect(button).toBeDisabled();
      return;
    }
    await expect(button).toBeEnabled();
    const downloaded = page.waitForEvent("download");
    await button.click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(
      /^relatorio-financeiro-.*\.xlsx$/,
    );
    const buffer = await readFile((await download.path())!);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Relatório Financeiro"]);
    const sheet = workbook.Sheets["Relatório Financeiro"];
    const rows = XLSX.utils.sheet_to_json(sheet);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      Data: "06/09/2026",
      Natureza: "Entrada",
      Tipo: "Dízimo",
      "Origem/Descrição": "João — Missões",
      Valor: 1250.75,
    });
    expect(rows[1]).toMatchObject({
      Natureza: "Saída",
      Tipo: "Água",
      Valor: -50.25,
    });
    expect(sheet.D3.t).toBe("s");
    expect(sheet.D3.v).toBe("=1+1");
    expect(sheet.D3.f).toBeUndefined();
  });
}

test("Recharts dashboard renders with the updated Lodash dependency", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/auth/me")
      body = {
        id: "admin-test",
        name: "Admin",
        email: "admin@example.test",
        role: "admin",
        status: "active",
        mfaEnabled: false,
      };
    else if (path === "/api/finance/dashboard")
      body = {
        chartData: [
          {
            year: "2026",
            month: "9",
            totalEntries: "1250.75",
            totalExpenses: "50.25",
          },
        ],
        totalBalance: "1200.50",
        currentMonth: {
          totalEntries: "1250.75",
          totalExpenses: "50.25",
          balance: "1200.50",
        },
        topExpenseCategories: [{ category: "agua", total: "50.25", count: 1 }],
      };
    else if (path.includes("notifications"))
      body = { count: 0, notifications: [], total: 0 };
    await route.fulfill({ json: body });
  });
  await page.goto("/finance");
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  expect(errors).toEqual([]);
});
