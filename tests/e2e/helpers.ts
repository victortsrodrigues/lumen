import { type Page, expect } from "@playwright/test";
import pg from "pg";
import speakeasy from "speakeasy";

const { Pool } = pg;

const API_URL = "http://localhost:3000/api";
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://church_erp:church_erp@localhost:5433/church_erp",
});

// ─── DB HELPERS ──────────────────────────────────────────────────────────────

export async function truncateAll() {
  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  const tables = rows.map((r: any) => `"${r.tablename}"`).join(", ");
  if (tables) await pool.query(`TRUNCATE ${tables} CASCADE`);
}

// ─── API HELPERS (fast setup without browser) ────────────────────────────────

async function apiRequest(
  method: string,
  path: string,
  body?: any,
  cookie?: string
): Promise<{ status: number; body: any; cookie: string }> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  const setCookie = res.headers.get("set-cookie") || cookie || "";
  const ct = res.headers.get("content-type") || "";
  const resBody = ct.includes("json") ? await res.json() : await res.text();

  return { status: res.status, body: resBody, cookie: setCookie };
}

async function apiGetCsrf(): Promise<string> {
  const res = await apiRequest("GET", "/auth/csrf");
  return res.body.csrfToken;
}

export async function apiRegisterUser(
  email: string,
  password: string,
  name: string
): Promise<{ cookie: string; user: any }> {
  const res = await apiRequest("POST", "/auth/register", {
    email,
    password,
    name,
    consentAccepted: true,
  });
  return { cookie: res.cookie, user: res.body.user };
}

export async function apiLoginUser(
  email: string,
  password: string
): Promise<{ cookie: string; user: any }> {
  const csrf = await apiGetCsrf();
  const res = await apiRequest("POST", "/auth/login", {
    email,
    password,
    csrfToken: csrf,
  });
  return { cookie: res.cookie, user: res.body.user };
}

export async function apiRegisterAdmin(
  suffix?: string
): Promise<{ cookie: string; user: any; email: string; password: string }> {
  const id = suffix || crypto.randomUUID().slice(0, 8);
  const email = `admin-${id}@test.local`;
  const password = "Admin1234!";
  const { user } = await apiRegisterUser(email, password, `Admin ${id}`);
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
  const login = await apiLoginUser(email, password);
  return { cookie: login.cookie, user: login.user, email, password };
}

export async function apiRegisterLeader(
  suffix?: string
): Promise<{ cookie: string; user: any; email: string; password: string }> {
  const id = suffix || crypto.randomUUID().slice(0, 8);
  const email = `leader-${id}@test.local`;
  const password = "Leader1234!";
  const { user } = await apiRegisterUser(email, password, `Leader ${id}`);
  await pool.query("UPDATE users SET role = 'leader' WHERE id = $1", [user.id]);
  const login = await apiLoginUser(email, password);
  return { cookie: login.cookie, user: login.user, email, password };
}

export async function apiRegisterMember(
  suffix?: string
): Promise<{ cookie: string; user: any; email: string; password: string }> {
  const id = suffix || crypto.randomUUID().slice(0, 8);
  const email = `member-${id}@test.local`;
  const password = "Member1234!";
  await apiRegisterUser(email, password, `Member ${id}`);
  const login = await apiLoginUser(email, password);
  return { cookie: login.cookie, user: login.user, email, password };
}

export async function apiCreateMember(
  cookie: string,
  data: Record<string, any>
): Promise<any> {
  const res = await apiRequest(
    "POST",
    "/members",
    { lgpdConsentAccepted: true, ...data },
    cookie
  );
  return res.body;
}

export async function apiCreateFinanceEntry(
  cookie: string,
  data: Record<string, any>
): Promise<any> {
  const res = await apiRequest("POST", "/finance/entries", data, cookie);
  return res.body;
}

export async function apiCreateCourse(
  cookie: string,
  data: Record<string, any>
): Promise<any> {
  const res = await apiRequest("POST", "/teaching/courses", data, cookie);
  return res.body;
}

export async function apiCreateEvent(
  cookie: string,
  data: Record<string, any>
): Promise<any> {
  const res = await apiRequest("POST", "/events", data, cookie);
  return res.body;
}

export async function apiSetupMfa(
  cookie: string
): Promise<{ mfaSecret: string }> {
  const setupRes = await apiRequest("POST", "/auth/mfa/setup", undefined, cookie);
  const mfaSecret = setupRes.body.secret;
  // Verify to enable MFA
  const token = speakeasy.totp({ secret: mfaSecret, encoding: "base32" });
  const csrf = await apiGetCsrf();
  await apiRequest(
    "POST",
    "/auth/mfa/verify",
    { code: token, csrfToken: csrf },
    cookie
  );
  return { mfaSecret };
}

// ─── BROWSER AUTH HELPERS ────────────────────────────────────────────────────

export async function loginAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]:visible').fill(email);
  await page.locator('input[type="password"]:visible').fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  // Wait for navigation away from login page
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 });
}

export async function loginAsWithMfa(
  page: Page,
  email: string,
  password: string,
  mfaSecret: string
): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]:visible').fill(email);
  await page.locator('input[type="password"]:visible').fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/mfa-verify/, { timeout: 10000 });
  const code = speakeasy.totp({ secret: mfaSecret, encoding: "base32" });
  await page.locator('input[placeholder="000000"]').fill(code);
  await page.getByRole("button", { name: /verificar/i }).click();
  await page.waitForFunction(() => !window.location.pathname.includes('/mfa-verify'), { timeout: 15000 });
}

export async function loginAsNewAdmin(
  page: Page,
  suffix?: string
): Promise<{ email: string; password: string }> {
  const admin = await apiRegisterAdmin(suffix);
  await loginAs(page, admin.email, admin.password);
  return { email: admin.email, password: admin.password };
}

export async function loginAsNewLeader(
  page: Page,
  suffix?: string
): Promise<{ email: string; password: string }> {
  const leader = await apiRegisterLeader(suffix);
  await loginAs(page, leader.email, leader.password);
  return { email: leader.email, password: leader.password };
}

export async function loginAsNewMember(
  page: Page,
  suffix?: string
): Promise<{ email: string; password: string }> {
  const member = await apiRegisterMember(suffix);
  await loginAs(page, member.email, member.password);
  return { email: member.email, password: member.password };
}

// ─── ADDITIONAL API HELPERS ──────────────────────────────────────────────────

export async function apiCreateMinistry(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/ministries", data, cookie);
  return res.body;
}

export async function apiAddMinistryMember(cookie: string, ministryId: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", `/ministries/${ministryId}/members`, data, cookie);
  return res.body;
}

export async function apiCreateAsset(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/assets", data, cookie);
  return res.body;
}

export async function apiCreateServiceRole(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/schedules/roles", data, cookie);
  return res.body;
}

export async function apiCreateMedia(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/media", data, cookie);
  return res.body;
}

export async function apiCreateDirective(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/planning/directives", data, cookie);
  return res.body;
}

export async function apiCreateObjective(cookie: string, directiveId: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", `/planning/directives/${directiveId}/objectives`, data, cookie);
  return res.body;
}

export async function apiCreateInitiative(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/planning/initiatives", data, cookie);
  return res.body;
}

export async function apiCreateBudget(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/finance/budgets", data, cookie);
  return res.body;
}

export async function apiAddBudgetItems(cookie: string, budgetId: string, items: any[]): Promise<any> {
  const res = await apiRequest("POST", `/finance/budgets/${budgetId}/items`, { items }, cookie);
  return res.body;
}

export async function apiCreateMinistryGoal(cookie: string, ministryId: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", `/ministries/${ministryId}/goals`, data, cookie);
  return res.body;
}

export async function apiScheduleVolunteer(cookie: string, eventId: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", `/events/${eventId}/schedule`, data, cookie);
  return res.body;
}

export async function apiCreatePastoralVisit(cookie: string, data: Record<string, any>): Promise<any> {
  const res = await apiRequest("POST", "/pastoral", data, cookie);
  return res.body;
}
