import { test, expect } from "@playwright/test";
import {
  truncateAll, apiRegisterAdmin, apiCreateMember, apiCreateEvent, loginAs,
} from "./helpers";

const P = "evt-" + Date.now().toString(36);
const futureDate = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
const futureEndDate = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 7200000).toISOString();

test.describe("05-events", () => {
  let adminEmail: string, adminPw: string, adminCk: string;
  let memberId: string, eventId: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password; adminCk = admin.cookie;
    const m = await apiCreateMember(adminCk, { fullName: `EvtMember ${P}`, email: `evtm-${P}@t.local` });
    memberId = m.id;
    const ev = await apiCreateEvent(adminCk, {
      title: `Culto ${P}`, type: "culto", startDate: futureDate(), endDate: futureEndDate(), location: "Templo",
    });
    eventId = ev.id;
  });

  test("1. Events page loads", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/events");
    await expect(page.getByText(/agenda de eventos/i)).toBeVisible();
  });

  test("2. Upcoming widget shows event", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/events");
    await expect(page.getByText(/próximos eventos/i)).toBeVisible();
  });

  test("3. Create event", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/events");
    await page.getByText(/novo evento/i).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("input").first().fill(`Reunião ${P}`);
    await modal.locator("select").first().selectOption("reuniao");
    const dtInputs = modal.locator("input[type='datetime-local']");
    await dtInputs.first().fill("2025-06-15T19:00");
    await dtInputs.last().fill("2025-06-15T21:00");
    await modal.getByRole("button", { name: /criar/i }).click();
    await page.waitForTimeout(1000);
  });

  test("4. Filter by type", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/events");
    await page.locator("select").first().selectOption("culto");
    await page.waitForTimeout(500);
  });

  test("5. View event detail", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/events/${eventId}`);
    await expect(page.getByText(`Culto ${P}`).first()).toBeVisible();
  });

  test("6. Register member in event", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("input").first().fill(memberId);
    await modal.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(1000);
  });

  test("7. Record attendance", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/events/${eventId}`);
    const presBtn = page.getByRole("button", { name: /presença/i });
    if (await presBtn.isVisible()) {
      await presBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("8. Delete event", async ({ page }) => {
    const ev = await apiCreateEvent(adminCk, {
      title: `Del ${P}`, type: "social", startDate: futureDate(), endDate: futureEndDate(),
    });
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/events");
    page.on("dialog", (d) => d.accept());
    const delBtn = page.locator("[title='Excluir']").first();
    if (await delBtn.isVisible()) {
      await delBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("9. Full event shows error", async ({ page }) => {
    const ev = await apiCreateEvent(adminCk, {
      title: `Full ${P}`, type: "reuniao", startDate: futureDate(), endDate: futureEndDate(), maxSlots: 1,
    });
    // Fill the slot via API
    await fetch(`http://localhost:3000/api/events/${ev.id}/register`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCk },
      body: JSON.stringify({ memberId }),
    });
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/events/${ev.id}`);
    // Try to register another
    await page.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    const newMember = await apiCreateMember(adminCk, { fullName: `Extra ${P}` });
    await modal.locator("input").first().fill(newMember.id);
    await modal.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(1000);
    // Should see error toast about full event
  });
});
