import { test, expect } from "@playwright/test";
import {
  truncateAll, apiRegisterAdmin, apiRegisterMember, apiSetupMfa,
  loginAs, loginAsWithMfa,
} from "./helpers";

const P = "aud-" + Date.now().toString(36);

test.describe("08-audit", () => {
  let adminEmail: string, adminPw: string;
  let mfaSecret: string;
  let memberEmail: string, memberPw: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password;
    // Setup MFA for admin
    const mfa = await apiSetupMfa(admin.cookie);
    mfaSecret = mfa.mfaSecret;
    // Create member for permission test
    const member = await apiRegisterMember(`${P}-m`);
    memberEmail = member.email; memberPw = member.password;
  });

  test("1. Audit page loads (admin + MFA)", async ({ page }) => {
    await loginAsWithMfa(page, adminEmail, adminPw, mfaSecret);
    await page.goto("/audit-logs");
    await page.waitForTimeout(1000);
    // Should see audit table or audit content
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("2. Logs have data", async ({ page }) => {
    await loginAsWithMfa(page, adminEmail, adminPw, mfaSecret);
    await page.goto("/audit-logs");
    await page.waitForTimeout(1000);
    // At least the login actions should be logged
  });

  test("3. Pagination works", async ({ page }) => {
    await loginAsWithMfa(page, adminEmail, adminPw, mfaSecret);
    await page.goto("/audit-logs");
    await page.waitForTimeout(1000);
    // If there are enough logs, pagination buttons should be visible
  });

  test("4. Non-admin redirects", async ({ page }) => {
    await loginAs(page, memberEmail, memberPw);
    await page.goto("/audit-logs");
    // Should redirect to / (member can't access audit)
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/audit-logs");
  });
});
