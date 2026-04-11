import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerMember } from "./helpers";

const P = "cal-" + crypto.randomUUID().slice(0, 6);

describe("18-calendar", () => {
  let adminCk: string;
  let memberCk: string;
  const currentYear = String(new Date().getFullYear());

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create events in different months of current year
    const months = [1, 3, 6, 9, 12];
    for (const month of months) {
      const start = `${currentYear}-${String(month).padStart(2, "0")}-15T10:00:00Z`;
      const end = `${currentYear}-${String(month).padStart(2, "0")}-15T12:00:00Z`;
      await request("POST", "/events", {
        title: `CalEvent ${P} M${month}`, type: "culto",
        startDate: start, endDate: end,
      }, adminCk);
    }
  });

  it("1. GET /events/calendar returns 12 months", async () => {
    const res = await request("GET", `/events/calendar?year=${currentYear}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.year).toBe(currentYear);
    expect(res.body.months.length).toBe(12);
    expect(res.body.months[0].month).toBe("01");
    expect(res.body.months[0].label).toBe("Janeiro");
    expect(res.body.months[11].month).toBe("12");
    expect(res.body.months[11].label).toBe("Dezembro");
  });

  it("2. Events appear in correct month", async () => {
    const res = await request("GET", `/events/calendar?year=${currentYear}`, undefined, adminCk);
    // Month 3 (March) should have at least 1 event
    const march = res.body.months.find((m: any) => m.month === "03");
    expect(march.events.length).toBeGreaterThanOrEqual(1);
    const titles = march.events.map((e: any) => e.title);
    expect(titles.some((t: string) => t.includes(`M3`))).toBe(true);
  });

  it("3. totalEvents matches sum", async () => {
    const res = await request("GET", `/events/calendar?year=${currentYear}`, undefined, adminCk);
    const sum = res.body.months.reduce((acc: number, m: any) => acc + m.events.length, 0);
    expect(res.body.totalEvents).toBe(sum);
  });

  it("4. Year with no events returns empty months", async () => {
    const res = await request("GET", "/events/calendar?year=2099", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.totalEvents).toBe(0);
    expect(res.body.months.every((m: any) => m.events.length === 0)).toBe(true);
  });

  it("5. No auth → 401", async () => {
    const res = await request("GET", `/events/calendar?year=${currentYear}`);
    expect(res.status).toBe(401);
  });
});
