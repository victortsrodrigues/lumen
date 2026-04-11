import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateEvent } from "./helpers";

const P = "e2e-cal-" + Date.now().toString(36);

test.describe("19-calendar", () => {
  test("1. Toggle para visão calendário funciona", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-1`);
    await page.goto("/events");
    await expect(page.getByText("Calendário")).toBeVisible({ timeout: 10000 });
    await page.getByText("Calendário").click();
    // Should show month names
    await expect(page.getByText("Janeiro")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Dezembro")).toBeVisible();
  });

  test("2. Eventos aparecem no mês correto", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-2`);
    const year = new Date().getFullYear();
    await apiCreateEvent(admin.cookie, {
      title: `CalEvento ${P}`, type: "conferencia",
      startDate: `${year}-06-15T10:00:00Z`,
      endDate: `${year}-06-15T12:00:00Z`,
    });

    await loginAsNewAdmin(page, `${P}-2b`);
    await page.goto("/events");
    await page.getByText("Calendário").click();
    // June should have our event
    await expect(page.getByText(`CalEvento ${P}`)).toBeVisible({ timeout: 10000 });
  });
});
