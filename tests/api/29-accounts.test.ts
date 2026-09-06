import { beforeAll, describe, expect, it } from "vitest";
import {
  getCsrfToken,
  loginUser,
  pool,
  registerAdmin,
  registerMember,
  request,
} from "./helpers";

const P = `accounts-${crypto.randomUUID().slice(0, 6)}`;

describe("29-accounts", () => {
  let adminCookie: string;
  let adminId: string;
  let memberCookie: string;
  let pendingId: string;
  const pendingEmail = `${P}@test.local`;
  const pendingPassword = "AccountPass1234!";

  beforeAll(async () => {
    const admin = await registerAdmin(`${P}-admin`);
    adminCookie = admin.cookie;
    adminId = admin.user.id;

    const member = await registerMember(`${P}-member`);
    memberCookie = member.cookie;

    const csrfToken = await getCsrfToken();
    const registration = await request("POST", "/auth/register", {
      email: pendingEmail,
      password: pendingPassword,
      name: "Pending Account",
      consentAccepted: true,
      csrfToken,
    });
    expect(registration.status).toBe(202);
    pendingId = registration.body.user.id;
  });

  it("1. Normal members cannot consult accounts", async () => {
    const res = await request("GET", "/admin/accounts", undefined, memberCookie);
    expect(res.status).toBe(403);
  });

  it("2. Admin lists the pending request", async () => {
    const res = await request("GET", "/admin/accounts?status=pending", undefined, adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.accounts.some((account: any) => account.id === pendingId)).toBe(true);
    expect(res.body.summary.pending).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND type = 'account.requested'",
      [adminId]
    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });

  it("3. Admin approves the account", async () => {
    const res = await request("POST", `/admin/accounts/${pendingId}/approve`, {}, adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");

    const login = await loginUser(pendingEmail, pendingPassword);
    expect(login.user.status).toBe("active");
    memberCookie = login.cookie;
  });

  it("4. Admin promotes a member to leader and invalidates the old session", async () => {
    const res = await request("PATCH", `/admin/accounts/${pendingId}/role`, {
      role: "leader",
      csrfToken: await getCsrfToken(),
    }, adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("leader");

    const oldSession = await request("GET", "/auth/me", undefined, memberCookie);
    expect(oldSession.status).toBe(401);

    const login = await loginUser(pendingEmail, pendingPassword);
    expect(login.user.role).toBe("leader");
    memberCookie = login.cookie;
  });

  it("5. Blocking requires a reason and immediately removes access", async () => {
    const noReason = await request("POST", `/admin/accounts/${pendingId}/block`, {
      csrfToken: await getCsrfToken(),
    }, adminCookie);
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toBe("REASON_REQUIRED");

    const blocked = await request("POST", `/admin/accounts/${pendingId}/block`, {
      reason: "Bloqueio temporário de teste",
      csrfToken: await getCsrfToken(),
    }, adminCookie);
    expect(blocked.status).toBe(200);
    expect(blocked.body.status).toBe("blocked");

    const oldSession = await request("GET", "/auth/me", undefined, memberCookie);
    expect(oldSession.status).toBe(401);
    const denied = await request("POST", "/auth/login", {
      email: pendingEmail,
      password: pendingPassword,
      csrfToken: await getCsrfToken(),
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("ACCOUNT_BLOCKED");
  });

  it("6. Admin unblocks, revokes and reactivates access", async () => {
    const unblocked = await request("POST", `/admin/accounts/${pendingId}/unblock`, {
      csrfToken: await getCsrfToken(),
    }, adminCookie);
    expect(unblocked.status).toBe(200);
    expect(unblocked.body.status).toBe("active");

    const revoked = await request("POST", `/admin/accounts/${pendingId}/revoke`, {
      reason: "Revogação de teste",
      csrfToken: await getCsrfToken(),
    }, adminCookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe("revoked");

    const denied = await request("POST", "/auth/login", {
      email: pendingEmail,
      password: pendingPassword,
      csrfToken: await getCsrfToken(),
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("ACCOUNT_REVOKED");

    const reactivated = await request("POST", `/admin/accounts/${pendingId}/reactivate`, {
      csrfToken: await getCsrfToken(),
    }, adminCookie);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.status).toBe("active");
  });

  it("7. Admin cannot block their own account", async () => {
    const res = await request("POST", `/admin/accounts/${adminId}/block`, {
      reason: "Teste",
      csrfToken: await getCsrfToken(),
    }, adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SELF_ACCESS_CHANGE");
  });

  it("8. User deletes the account without admin approval", async () => {
    const login = await loginUser(pendingEmail, pendingPassword);
    const res = await request("DELETE", "/auth/account", {
      password: pendingPassword,
      confirmation: "EXCLUIR",
      csrfToken: await getCsrfToken(),
    }, login.cookie);
    expect(res.status).toBe(200);
    expect(res.body.deletionReference).toBeTruthy();

    const { rows: users } = await pool.query("SELECT id FROM users WHERE id = $1", [pendingId]);
    expect(users).toHaveLength(0);

    const { rows: notifications } = await pool.query(
      "SELECT id FROM notifications WHERE user_id = $1 AND type = 'account.deleted'",
      [adminId]
    );
    expect(notifications.length).toBeGreaterThanOrEqual(1);
  });
});
