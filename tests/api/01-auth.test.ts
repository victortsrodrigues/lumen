import { describe, it, expect, beforeAll } from "vitest";
import speakeasy from "speakeasy";
import {
  request, getCsrfToken, registerUser, loginUser, registerAdmin,
  getAuthEmailToken, getResetToken, generateExpiredToken, assertErrorShape, pool,
} from "./helpers";

const PREFIX = "auth-test-" + crypto.randomUUID().slice(0, 6);

describe("01-auth", () => {
  const email = `${PREFIX}@test.local`;
  const password = "TestPass1234!";
  let cookie: string;

  it("1. GET /auth/csrf returns token", async () => {
    const csrf = await getCsrfToken();
    expect(typeof csrf).toBe("string");
    expect(csrf.length).toBeGreaterThan(0);
  });

  it("2. Register OK", async () => {
    const csrfToken = await getCsrfToken();
    const res = await request("POST", "/auth/register", {
      email, password, name: "Auth Test User", consentAccepted: true, csrfToken,
    });
    expect(res.status).toBe(202);
    expect(res.body.user.role).toBe("member");
    expect(res.body.user.status).toBe("pending");
    expect(res.body.user.mfaEnabled).toBe(false);
    expect(res.body.message).toContain("aprovação");
    expect(res.cookie).toBe("");
  });

  it("3. Register duplicate email → 409", async () => {
    const csrfToken = await getCsrfToken();
    const res = await request("POST", "/auth/register", {
      email, password, name: "Dup", consentAccepted: true, csrfToken,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("EMAIL_IN_USE");
    assertErrorShape(res);
  });

  it("4. Register short password → 400", async () => {
    const csrfToken = await getCsrfToken();
    const res = await request("POST", "/auth/register", {
      email: `short-${PREFIX}@test.local`, password: "123", name: "Short", consentAccepted: true, csrfToken,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("8 caracteres");
  });

  it("5. Register without consent → 400", async () => {
    const csrfToken = await getCsrfToken();
    const res = await request("POST", "/auth/register", {
      email: `nocons-${PREFIX}@test.local`, password, name: "NoCons", csrfToken,
    });
    expect(res.status).toBe(400);
  });

  it("6. Register missing fields → 400", async () => {
    const csrfToken = await getCsrfToken();
    const res = await request("POST", "/auth/register", { email: `x-${PREFIX}@test.local`, csrfToken });
    expect(res.status).toBe(400);
  });

  it("7. Pending account cannot log in", async () => {
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/login", { email, password, csrfToken: csrf });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ACCOUNT_PENDING");
  });

  it("8. Login OK after approval", async () => {
    await pool.query(
      "UPDATE users SET status = 'active', approved_at = NOW() WHERE email = $1",
      [email]
    );
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/login", { email, password, csrfToken: csrf });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.message).toBe("Login realizado com sucesso");
    cookie = res.cookie;
  });

  it("9. Login invalid CSRF → 403", async () => {
    const res = await request(
      "POST",
      "/auth/login",
      { email, password },
      undefined,
      { "X-CSRF-Token": "bad" },
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("CSRF_ERROR");
  });

  it("10. Login wrong password → 401", async () => {
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/login", { email, password: "wrong", csrfToken: csrf });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_CREDENTIALS");
  });

  it("11. Login nonexistent email → 401", async () => {
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/login", {
      email: "nobody@nowhere.com", password: "x", csrfToken: csrf,
    });
    expect(res.status).toBe(401);
  });

  it("12. Rate limiting after 6 attempts", async () => {
    const csrf = await getCsrfToken();
    const fakeIp = "10.0.0.99";
    for (let i = 0; i < 6; i++) {
      await request("POST", "/auth/login", {
        email, password: "wrong", csrfToken: csrf,
      }, undefined, { "X-Forwarded-For": fakeIp });
    }
    const res = await request("POST", "/auth/login", {
      email, password: "wrong", csrfToken: csrf,
    }, undefined, { "X-Forwarded-For": fakeIp });
    expect(res.status).toBe(429);
  });

  it("13. Login OK from different IP after rate limit", async () => {
    const login = await loginUser(email, password, { "X-Forwarded-For": "10.0.0.100" });
    expect(login.user.email).toBe(email);
  });

  it("14. GET /auth/me authenticated", async () => {
    const res = await request("GET", "/auth/me", undefined, cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("role");
  });

  it("15. GET /auth/me without cookie → 401", async () => {
    const res = await request("GET", "/auth/me");
    expect(res.status).toBe(401);
    assertErrorShape(res);
  });

  it("16. GET /auth/me with expired JWT → 401", async () => {
    const expiredToken = generateExpiredToken({ userId: "x", email: "x", role: "member", memberId: null, sessionVersion: 1, mfaVerified: false });
    const res = await request("GET", "/auth/me", undefined, `auth_token=${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it("17. Logout", async () => {
    const rejected = await request(
      "POST",
      "/auth/logout",
      undefined,
      cookie,
      { "X-CSRF-Token": "" },
    );
    expect(rejected.status).toBe(403);

    const res = await request("POST", "/auth/logout", undefined, cookie);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logout realizado com sucesso");
  });

  it("17b. A CSRF header must match its cookie", async () => {
    const csrf = await getCsrfToken();
    const res = await request(
      "POST",
      "/auth/login",
      { email, password },
      undefined,
      { "X-CSRF-Token": csrf, Cookie: "lumen_csrf=invalid" },
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("CSRF_ERROR");
  });

  it("18. Forgot password → always 200", async () => {
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/forgot-password", { email, csrfToken: csrf });
    expect(res.status).toBe(200);
  });

  it("19. Forgot password without CSRF → 403", async () => {
    const res = await request(
      "POST",
      "/auth/forgot-password",
      { email },
      undefined,
      { "X-CSRF-Token": "" },
    );
    expect(res.status).toBe(403);
  });

  it("20. Reset password with valid token", async () => {
    // First trigger forgot-password to generate token
    const csrf1 = await getCsrfToken();
    await request("POST", "/auth/forgot-password", { email, csrfToken: csrf1 });

    const token = await getResetToken(email);
    expect(token).toBeTruthy();

    const { rows: storedTokens } = await pool.query(
      "SELECT token_hash FROM auth_tokens WHERE user_id = (SELECT id FROM users WHERE email = $1) AND purpose = 'reset_password' ORDER BY created_at DESC LIMIT 1",
      [email],
    );
    expect(storedTokens[0].token_hash).not.toBe(token);

    const csrf2 = await getCsrfToken();
    const res = await request("POST", "/auth/reset-password", {
      token, password: "NewPassword1234!", csrfToken: csrf2,
    });
    expect(res.status).toBe(200);

    const previousSession = await request("GET", "/auth/me", undefined, cookie);
    expect(previousSession.status).toBe(401);

    const reused = await request("POST", "/auth/reset-password", {
      token, password: "AnotherPassword1234!", csrfToken: await getCsrfToken(),
    });
    expect(reused.status).toBe(400);
  });

  it("21. Reset password invalid token → 400", async () => {
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/reset-password", {
      token: "invalid-token", password: "NewPass1234!", csrfToken: csrf,
    });
    expect(res.status).toBe(400);
  });

  it("22. Email verification token is single-use", async () => {
    await pool.query("UPDATE users SET email_verified_at = NULL WHERE email = $1", [email]);
    const requested = await request("POST", "/auth/resend-verification", {
      email,
      csrfToken: await getCsrfToken(),
    });
    expect(requested.status).toBe(200);

    const verificationToken = await getAuthEmailToken(email, "email_verification");
    expect(verificationToken).toBeTruthy();
    const verified = await request("POST", "/auth/verify-email", {
      token: verificationToken,
      csrfToken: await getCsrfToken(),
    });
    expect(verified.status).toBe(200);

    const { rows } = await pool.query("SELECT email_verified_at FROM users WHERE email = $1", [email]);
    expect(rows[0].email_verified_at).toBeTruthy();
    const reused = await request("POST", "/auth/verify-email", {
      token: verificationToken,
      csrfToken: await getCsrfToken(),
    });
    expect(reused.status).toBe(400);
  });

  // MFA tests use a separate admin user
  let mfaAdminCookie: string;
  let mfaSecret: string;

  it("23. MFA setup", async () => {
    const admin = await registerAdmin(`mfa-${PREFIX.slice(0, 4)}`);
    mfaAdminCookie = admin.cookie;
    const res = await request("POST", "/auth/mfa/setup", undefined, mfaAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.secret).toBeTruthy();
    expect(res.body.qrCodeUrl).toContain("data:");
    expect(res.body.backupCodes).toHaveLength(8);
    mfaSecret = res.body.secret;
  });

  it("24. MFA verify invalid code → 400", async () => {
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/mfa/verify", {
      code: "000000", csrfToken: csrf,
    }, mfaAdminCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_CODE");
  });

  it("25. MFA verify valid TOTP", async () => {
    const code = speakeasy.totp({ secret: mfaSecret, encoding: "base32" });
    const csrf = await getCsrfToken();
    const res = await request("POST", "/auth/mfa/verify", {
      code, csrfToken: csrf,
    }, mfaAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.user.mfaEnabled).toBe(true);
    expect(res.body.user.mfaVerified).toBe(true);
  });
});
