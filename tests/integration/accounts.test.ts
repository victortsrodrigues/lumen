import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import app from "../../artifacts/api-server/src/app";
import { pool } from "../../lib/db/src";
import { signToken } from "../../artifacts/api-server/src/lib/jwt";
import { generateCsrfToken } from "../../artifacts/api-server/src/lib/csrf";
import { hashAuthToken } from "../../artifacts/api-server/src/lib/email";
import { notifyMember } from "../../artifacts/api-server/src/lib/notifications";
import { deleteOwnAccountData } from "../../artifacts/api-server/src/lib/accountDeletion";

const prefix = `accounts-${randomUUID()}`;
let server: Server;
let base: string;
let adminId: string;

async function account(
  overrides: {
    status?: string;
    role?: string;
    email?: string;
    verified?: boolean;
  } = {},
) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id,email,password_hash,name,role,status,email_verified_at)
    VALUES ($1,$2,'not-a-login-password',$3,$4,$5,$6)`,
    [
      id,
      overrides.email ?? `${id}@example.test`,
      `${prefix} account`,
      overrides.role ?? "member",
      overrides.status ?? "pending",
      overrides.verified === false ? null : new Date(),
    ],
  );
  return id;
}
async function member(email?: string, name = `${prefix} member`) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO members (id,full_name,email,created_by_user_id,updated_by_user_id)
    VALUES ($1,$2,$3,$4,$4)`,
    [id, name, email ?? `${id}@example.test`, adminId],
  );
  return id;
}
async function row(id: string) {
  return (await pool.query("SELECT * FROM users WHERE id=$1", [id])).rows[0];
}
async function cookie(id: string) {
  const user = await row(id);
  return `auth_token=${signToken({
    userId: id,
    email: user.email,
    role: user.role,
    memberId: user.member_id,
    sessionVersion: user.session_version,
    mfaVerified: false,
  })}`;
}
async function request(
  method: string,
  path: string,
  body?: unknown,
  actor: string | null = adminId,
  csrf = true,
  session?: string,
) {
  const token = generateCsrfToken();
  const cookies = [
    session ?? (actor ? await cookie(actor) : ""),
    `lumen_csrf=${token}`,
  ].filter(Boolean);
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies.join("; "),
      ...(csrf ? { "x-csrf-token": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const action = (id: string, name: string, body: unknown = {}) =>
  request("POST", `/admin/accounts/${id}/${name}`, body);
const link = (id: string, memberId: string | null) =>
  request("PATCH", `/admin/accounts/${id}/member-link`, { memberId });

beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/lumen_accounts_test")
    throw new Error("Unsafe test database");
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  adminId = await account({ role: "admin", status: "active" });
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await pool.end();
});

describe("account lifecycle and member identity", () => {
  it("protects all new operations with authentication, administrator role and CSRF", async () => {
    const target = await account();
    for (const role of ["member", "leader"]) {
      const actor = await account({ role, status: "active" });
      expect(
        (
          await request(
            "GET",
            "/admin/accounts/member-options",
            undefined,
            actor,
          )
        ).status,
      ).toBe(403);
      for (const [method, suffix, body] of [
        ["POST", "reject", { reason: "Test" }],
        ["POST", "reopen", {}],
        ["PATCH", "member-link", { memberId: null }],
      ] as const) {
        expect(
          (
            await request(
              method,
              `/admin/accounts/${target}/${suffix}`,
              body,
              actor,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await request(
              method,
              `/admin/accounts/${target}/${suffix}`,
              body,
              null,
            )
          ).status,
        ).toBe(401);
        expect(
          (
            await request(
              method,
              `/admin/accounts/${target}/${suffix}`,
              body,
              adminId,
              false,
            )
          ).status,
        ).toBe(403);
      }
    }
    expect((await row(target)).status).toBe("pending");
  });

  it("rejects with a reason, preserves records/email and reopens without granting access", async () => {
    const id = await account({ verified: false });
    const m = await member();
    await link(id, m);
    for (const body of [
      {},
      { reason: "   " },
      { reason: "x".repeat(1001) },
      { reason: 3 },
    ]) {
      expect((await action(id, "reject", body)).status).toBe(400);
    }
    expect(
      (await action(id, "reject", { reason: "  Solicitação incorreta  " })).body
        .status,
    ).toBe("rejected");
    const rejected = await row(id);
    expect(rejected).toMatchObject({
      member_id: m,
      email_verified_at: null,
      status_reason: "Solicitação incorreta",
    });
    expect((await request("GET", "/auth/me", undefined, id)).status).toBe(401);
    expect(
      (
        await request(
          "POST",
          "/auth/register",
          {
            email: rejected.email,
            name: "Test",
            password: "TestPassword123!",
            consentAccepted: true,
          },
          null,
        )
      ).status,
    ).toBe(409);
    expect((await action(id, "approve")).status).toBe(409);
    expect((await action(id, "reject", { reason: "Again" })).status).toBe(409);
    expect((await action(id, "reopen")).body.status).toBe("pending");
    expect((await row(id)).email_verified_at).toBeNull();
    expect((await request("GET", "/auth/me", undefined, id)).status).toBe(401);
    expect((await action(id, "reopen")).status).toBe(409);
    const history = (
      await pool.query(
        "SELECT action,details FROM audit_logs WHERE resource_id=$1 ORDER BY created_at",
        [id],
      )
    ).rows;
    expect(history.map((r) => r.action)).toContain("ACCOUNT_REJECTED");
    expect(
      history.find((r) => r.action === "ACCOUNT_REOPENED").details
        .previousReason,
    ).toBe("Solicitação incorreta");
  });

  it("does not let email verification reactivate a rejected request", async () => {
    const id = await account({ verified: false });
    await action(id, "reject", { reason: "Test rejection" });
    const token = randomUUID() + randomUUID();
    await pool.query(
      `INSERT INTO auth_tokens (id,user_id,purpose,token_hash,expires_at)
      VALUES ($1,$2,'verify_email',$3,$4)`,
      [
        randomUUID(),
        id,
        hashAuthToken(token),
        new Date(Date.now() + 3_600_000).toISOString(),
      ],
    );
    expect(
      (await request("POST", "/auth/verify-email", { token }, null)).status,
    ).toBe(200);
    expect((await row(id)).status).toBe("rejected");
    expect((await request("GET", "/auth/me", undefined, id)).status).toBe(401);
  });

  it("serializes concurrent approval/rejection and records only one transition", async () => {
    const id = await account();
    const results = await Promise.all([
      action(id, "approve"),
      action(id, "reject", { reason: "Test" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const audit = await pool.query(
      "SELECT count(*)::int AS n FROM audit_logs WHERE resource_id=$1",
      [id],
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("selects a different-email member and invalidates sessions on link/change/unlink", async () => {
    const id = await account({ status: "active", role: "leader" });
    const first = await member();
    const second = await member();
    const original = await row(id);
    let session = await cookie(id);
    expect((await link(id, first)).status).toBe(200);
    expect(
      (await request("GET", "/auth/me", undefined, null, true, session)).status,
    ).toBe(401);
    expect((await request("GET", "/members/me", undefined, id)).body.id).toBe(
      first,
    );
    session = await cookie(id);
    expect((await link(id, second)).status).toBe(200);
    expect(
      (await request("GET", "/auth/me", undefined, null, true, session)).status,
    ).toBe(401);
    expect((await request("GET", "/members/me", undefined, id)).body.id).toBe(
      second,
    );
    session = await cookie(id);
    expect((await link(id, null)).status).toBe(200);
    expect(
      (await request("GET", "/auth/me", undefined, null, true, session)).status,
    ).toBe(401);
    expect((await request("GET", "/members/me", undefined, id)).status).toBe(
      404,
    );
    const updated = await row(id);
    expect(updated).toMatchObject({
      member_id: null,
      role: "leader",
      status: "active",
      session_version: original.session_version + 3,
    });
    expect(updated.email_verified_at).toEqual(original.email_verified_at);
    expect(updated.approved_at).toEqual(original.approved_at);
    const history = (
      await pool.query(
        "SELECT details FROM audit_logs WHERE resource_id=$1 ORDER BY created_at",
        [id],
      )
    ).rows;
    expect(history).toHaveLength(3);
    expect(history[2].details).toMatchObject({
      fromMemberId: second,
      toMemberId: null,
    });
  });

  it("never rematches an explicitly unlinked account by email, even during approval", async () => {
    const id = await account();
    const m = await member((await row(id)).email);
    await link(id, m);
    await link(id, null);
    expect((await action(id, "approve")).body.memberId).toBeNull();
    expect((await request("GET", "/members/me", undefined, id)).status).toBe(
      404,
    );
    expect(
      (await request("GET", "/dashboard/member-stats", undefined, id)).body
        .profile,
    ).toBeNull();
    expect((await row(id)).member_id).toBeNull();
    expect(
      await notifyMember(m, { type: "test", title: "Test", message: "Test" }),
    ).toBe(false);
  });

  it("does not lose session invalidations when role and member link change concurrently", async () => {
    const id = await account({ status: "active" });
    const m = await member();
    const original = await row(id);
    const results = await Promise.all([
      link(id, m),
      request("PATCH", `/admin/accounts/${id}/role`, { role: "leader" }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await row(id)).session_version).toBe(original.session_version + 2);
  });

  it("keeps an explicit approval choice and does not mark an email verified", async () => {
    const id = await account({ verified: false });
    const sameEmail = await member((await row(id)).email);
    const different = await member();
    const result = await action(id, "approve", { memberId: different });
    expect(result.body).toMatchObject({
      status: "active",
      memberId: different,
      emailVerifiedAt: null,
    });
    expect((await request("GET", "/auth/me", undefined, id)).status).toBe(401);
    const another = await account({ email: `${randomUUID()}@example.test` });
    await member((await row(another)).email);
    expect(
      (await action(another, "approve", { memberId: null })).body.memberId,
    ).toBeNull();
    expect(
      (await pool.query("SELECT id FROM members WHERE id=$1", [sameEmail]))
        .rowCount,
    ).toBe(1);
  });

  it("auto-links only a unique normalized exact available email", async () => {
    const id = await account();
    const match = await member(` ${(await row(id)).email.toUpperCase()} `);
    expect((await action(id, "approve")).body.memberId).toBe(match);
    const ambiguous = await account();
    await member((await row(ambiguous)).email);
    await member((await row(ambiguous)).email);
    expect((await action(ambiguous, "approve")).body.memberId).toBeNull();
    const occupied = await account();
    const taken = await member((await row(occupied)).email);
    await link(await account(), taken);
    expect((await action(occupied, "approve")).body.memberId).toBeNull();
    const wildcard = await account({ email: `${randomUUID()}_%@example.test` });
    await member((await row(wildcard)).email.replace("_%", "abc"));
    expect((await action(wildcard, "approve")).body.memberId).toBeNull();
  });

  it("rejects malformed links, missing members and links to deleting accounts", async () => {
    const id = await account();
    const m = await member();
    await link(id, m);
    for (const body of [
      {},
      { memberId: "" },
      { memberId: 5 },
      { memberId: null, role: "admin" },
    ]) {
      expect(
        (await request("PATCH", `/admin/accounts/${id}/member-link`, body))
          .status,
      ).toBe(400);
      expect((await row(id)).member_id).toBe(m);
    }
    expect((await link(id, randomUUID())).status).toBe(400);
    expect((await link(randomUUID(), m)).status).toBe(404);
    const deleting = await account({ status: "deleting" });
    expect((await link(deleting, null)).status).toBe(409);
  });

  it("prevents simultaneous duplicate links and enforces uniqueness at the database", async () => {
    const a = await account();
    const b = await account();
    const m = await member();
    const results = await Promise.all([link(a, m), link(b, m)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = (await row(a)).member_id ? b : a;
    await expect(
      pool.query("UPDATE users SET member_id=$1 WHERE id=$2", [m, loser]),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query("UPDATE users SET member_id=$1 WHERE id=$2", [
        randomUUID(),
        loser,
      ]),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("lists candidates with availability, pagination, literal search and no sensitive fields", async () => {
    const a = await account();
    const m = await member(undefined, `${prefix} exclusive-search_%`);
    await link(a, m);
    const result = await request(
      "GET",
      `/admin/accounts/member-options?search=${encodeURIComponent(`${prefix} exclusive-search_%`)}`,
    );
    expect(result.body.members).toHaveLength(1);
    expect(result.body.members[0]).toMatchObject({ id: m, linkedAccountId: a });
    expect(Object.keys(result.body.members[0]).sort()).toEqual(
      [
        "id",
        "name",
        "email",
        "status",
        "linkedAccountId",
        "linkedAccountName",
      ].sort(),
    );
    const first = await request(
      "GET",
      `/admin/accounts/member-options?search=${encodeURIComponent(prefix)}&page=1`,
    );
    const second = await request(
      "GET",
      `/admin/accounts/member-options?search=${encodeURIComponent(prefix)}&page=2`,
    );
    expect(first.body.members.length).toBeLessThanOrEqual(20);
    expect(
      first.body.members
        .map((v: { id: string }) => v.id)
        .filter((id: string) =>
          second.body.members.some((v: { id: string }) => v.id === id),
        ),
    ).toEqual([]);
  });

  it("delivers member notifications to the explicit account despite different emails", async () => {
    const a = await account({ status: "active" });
    const m = await member();
    await link(a, m);
    expect(
      await notifyMember(m, {
        type: "test.link",
        title: "Test",
        message: "Test",
      }),
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT user_id FROM notifications WHERE entity_id IS NULL AND type='test.link' AND user_id=$1",
          [a],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("uses the explicit link for teaching and confidential counseling permissions", async () => {
    const id = await account({ role: "leader", status: "active" });
    const m = await member();
    const c = randomUUID();
    const counseling = randomUUID();
    await pool.query(
      `INSERT INTO courses (id,title,teacher_id,category,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Synthetic course',$2,'escola_biblica',$3,$3)`,
      [c, m, adminId],
    );
    await pool.query(
      `INSERT INTO counseling_cases (id,member_id,member_name,counselor_id,counselor_name,topic,start_date,created_by_user_id,updated_by_user_id)
      VALUES ($1,$2,'Synthetic member',$2,'Synthetic counselor','Synthetic topic','2026-09-01',$3,$3)`,
      [counseling, m, adminId],
    );
    const teachingPath = `/teaching/courses/${c}`;
    const counselingPath = `/counseling/cases/${counseling}`;
    expect((await request("GET", counselingPath, undefined, id)).status).toBe(
      403,
    );
    await link(id, m);
    expect(
      (await request("PUT", teachingPath, { title: "Updated" }, id)).status,
    ).toBe(200);
    expect((await request("GET", counselingPath, undefined, id)).status).toBe(
      200,
    );
    expect(
      (await request("GET", "/lgpd/my-data", undefined, id)).body.member.id,
    ).toBe(m);
    // Identical email must not keep the old member permissions after unlinking.
    await pool.query("UPDATE members SET email=$1 WHERE id=$2", [
      (await row(id)).email,
      m,
    ]);
    await link(id, null);
    expect(
      (await request("PUT", teachingPath, { title: "Denied" }, id)).status,
    ).toBe(403);
    expect((await request("GET", counselingPath, undefined, id)).status).toBe(
      403,
    );
    expect((await request("GET", "/lgpd/my-data", undefined, id)).status).toBe(
      404,
    );
  });

  it("does not anonymize an unlinked same-email member during account deletion", async () => {
    const a = await account({ status: "active" });
    const m = await member((await row(a)).email);
    const original = (
      await pool.query("SELECT * FROM members WHERE id=$1", [m])
    ).rows[0];
    await deleteOwnAccountData(a);
    expect(
      (await pool.query("SELECT * FROM members WHERE id=$1", [m])).rows[0],
    ).toEqual(original);
    expect(await row(a)).toBeUndefined();
  });
});

describe("versioned migration", () => {
  it("upgrades the legacy schema and refuses duplicate/orphan links without altering them", async () => {
    const migration3 = await readFile(
      new URL(
        "../../lib/db/migrations/0003_rejected_accounts.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const migration4 = await readFile(
      new URL(
        "../../lib/db/migrations/0004_account_member_integrity.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const client = await pool.connect();
    const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(
        "CREATE TYPE account_status AS ENUM ('pending','active','blocked','revoked','deleting'); CREATE TABLE members(id text PRIMARY KEY); CREATE TABLE users(id text PRIMARY KEY, member_id text, status account_status DEFAULT 'pending'); INSERT INTO members VALUES ('m'); INSERT INTO users VALUES ('a','m'),('b','m')",
      );
      await client.query(migration3);
      await expect(client.query(migration4)).rejects.toThrow(
        "Duplicate account/member links",
      );
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS n FROM users WHERE member_id='m'",
          )
        ).rows[0].n,
      ).toBe(2);
      await client.query("UPDATE users SET member_id='missing' WHERE id='b'");
      await expect(client.query(migration4)).rejects.toThrow(
        "Orphan account/member links",
      );
      await client.query("UPDATE users SET member_id=NULL WHERE id='b'");
      await client.query(migration4);
      await client.query(migration4); // safe when schema already contains the constraint
      await client.query("UPDATE users SET status='rejected' WHERE id='b'");
      await expect(
        client.query("UPDATE users SET member_id='m' WHERE id='b'"),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("DELETE FROM members WHERE id='m'");
      expect(
        (await client.query("SELECT member_id FROM users WHERE id='a'")).rows[0]
          .member_id,
      ).toBeNull();
    } finally {
      await client.query("SET search_path TO public");
      // The generated schema exists only inside the guarded disposable test database.
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });
});
