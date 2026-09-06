import pg from "pg";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";

const { Pool } = pg;

export const BASE_URL = "http://localhost:3000/api";
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://church_erp:church_erp@localhost:5433/church_erp",
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-mude-em-producao";

// ─── REQUEST HELPER ──────────────────────────────────────────────────────────

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
  cookie: string;
}

export async function request(
  method: string,
  path: string,
  body?: any,
  cookie?: string,
  extraHeaders?: Record<string, string>
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    ...(body !== undefined && !(body instanceof Buffer)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...extraHeaders,
  };

  if (body instanceof Buffer) {
    headers["Content-Type"] = "application/octet-stream";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof Buffer
        ? body
        : JSON.stringify(body),
    redirect: "manual",
  });

  const setCookie = res.headers.get("set-cookie") || "";
  let resBody: any;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) {
    resBody = await res.json();
  } else {
    resBody = await res.text();
  }

  return {
    status: res.status,
    body: resBody,
    headers: res.headers,
    cookie: setCookie || cookie || "",
  };
}

// ─── AUTH HELPERS ────────────────────────────────────────────────────────────

export async function getCsrfToken(): Promise<string> {
  const res = await request("GET", "/auth/csrf");
  return res.body.csrfToken;
}

export async function registerUser(
  email: string,
  password: string,
  name: string
): Promise<{ cookie: string; user: any }> {
  const csrfToken = await getCsrfToken();
  const res = await request("POST", "/auth/register", {
    email,
    password,
    name,
    consentAccepted: true,
    csrfToken,
  });
  if (res.status !== 202) {
    throw new Error(`Failed to register test user: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Most API suites need a usable account. Public registration itself remains
  // pending; tests that exercise approval use the raw request helper instead.
  await pool.query(
    "UPDATE users SET status = 'active', approved_at = NOW() WHERE id = $1",
    [res.body.user.id]
  );
  return { cookie: "", user: res.body.user };
}

export async function loginUser(
  email: string,
  password: string,
  extraHeaders?: Record<string, string>
): Promise<{ cookie: string; user: any }> {
  const csrf = await getCsrfToken();
  const res = await request(
    "POST",
    "/auth/login",
    { email, password, csrfToken: csrf },
    undefined,
    extraHeaders
  );
  return { cookie: res.cookie, user: res.body.user || res.body };
}

export async function registerAdmin(
  suffix?: string
): Promise<{ cookie: string; user: any; email: string; password: string }> {
  const id = suffix || crypto.randomUUID().slice(0, 8);
  const email = `admin-${id}@test.local`;
  const password = "Admin1234!";
  const { user } = await registerUser(email, password, `Admin ${id}`);
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
  const login = await loginUser(email, password);
  return { cookie: login.cookie, user: login.user, email, password };
}

export async function registerLeader(
  suffix?: string
): Promise<{ cookie: string; user: any; email: string; password: string }> {
  const id = suffix || crypto.randomUUID().slice(0, 8);
  const email = `leader-${id}@test.local`;
  const password = "Leader1234!";
  const { user } = await registerUser(email, password, `Leader ${id}`);
  await pool.query("UPDATE users SET role = 'leader' WHERE id = $1", [user.id]);
  const login = await loginUser(email, password);
  return { cookie: login.cookie, user: login.user, email, password };
}

export async function registerMember(
  suffix?: string
): Promise<{ cookie: string; user: any; email: string; password: string }> {
  const id = suffix || crypto.randomUUID().slice(0, 8);
  const email = `member-${id}@test.local`;
  const password = "Member1234!";
  const { user } = await registerUser(email, password, `Member ${id}`);
  const login = await loginUser(email, password);
  return { cookie: login.cookie, user: login.user, email, password };
}

export async function registerAdminWithMfa(
  suffix?: string
): Promise<{ cookie: string; user: any; mfaSecret: string }> {
  const admin = await registerAdmin(suffix);

  // Setup MFA
  const setupRes = await request("POST", "/auth/mfa/setup", undefined, admin.cookie);
  const mfaSecret = setupRes.body.secret;

  // Generate valid TOTP
  const token = speakeasy.totp({ secret: mfaSecret, encoding: "base32" });
  const csrf = await getCsrfToken();
  const verifyRes = await request(
    "POST",
    "/auth/mfa/verify",
    { code: token, csrfToken: csrf },
    admin.cookie
  );

  return { cookie: verifyRes.cookie, user: verifyRes.body.user, mfaSecret };
}

// ─── DB HELPERS ──────────────────────────────────────────────────────────────

export async function getResetToken(email: string): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT reset_token FROM users WHERE email = $1",
    [email.toLowerCase()]
  );
  return rows[0]?.reset_token || null;
}

export async function promoteToRole(userId: string, role: string): Promise<void> {
  await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, userId]);
}

// ─── JWT HELPERS ─────────────────────────────────────────────────────────────

export function generateExpiredToken(payload: Record<string, any>): string {
  return jwt.sign(
    { ...payload, exp: Math.floor(Date.now() / 1000) - 3600 },
    JWT_SECRET
  );
}

// ─── ASSERTIONS ──────────────────────────────────────────────────────────────

export function assertStatus(res: ApiResponse, expected: number) {
  if (res.status !== expected) {
    throw new Error(
      `Expected status ${expected}, got ${res.status}. Body: ${JSON.stringify(res.body).slice(0, 200)}`
    );
  }
}

export function assertErrorShape(res: ApiResponse) {
  if (!res.body.error || !res.body.message) {
    throw new Error(
      `Expected { error, message } shape, got: ${JSON.stringify(res.body).slice(0, 200)}`
    );
  }
}

export function assertSecurityHeaders(res: ApiResponse) {
  const required = [
    "x-content-type-options",
    "x-frame-options",
  ];
  for (const h of required) {
    if (!res.headers.get(h)) {
      throw new Error(`Missing security header: ${h}`);
    }
  }
}

export function assertHasFields(obj: any, fields: string[]) {
  for (const f of fields) {
    if (!(f in obj)) {
      throw new Error(
        `Missing field "${f}" in object: ${JSON.stringify(obj).slice(0, 200)}`
      );
    }
  }
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

export async function cleanupUsers(prefix: string) {
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`${prefix}%`]);
}

export async function cleanup() {
  await pool.end();
}
