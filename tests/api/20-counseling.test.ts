import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember, pool } from "./helpers";

const P = "coun-" + crypto.randomUUID().slice(0, 6);

describe("20-counseling", () => {
  let adminCk: string;
  let leaderCk: string;
  let leaderEmail: string;
  let memberCk: string;
  let memberId: string;
  let counselorId: string;
  let caseId: string;
  let sessionId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    leaderEmail = l.email;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;

    // Create aconselhado member
    const mRes = await request("POST", "/members", {
      fullName: `Aconselhado ${P}`, email: `aconselhado-${P}@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    // Create counselor member (linked to leader email)
    const cRes = await request("POST", "/members", {
      fullName: `Conselheiro ${P}`, email: leaderEmail, lgpdConsentAccepted: true,
    }, adminCk);
    counselorId = cRes.body.id;
  });

  // ─── CREATE CASE ──────────────────────────────────────────────────────

  it("1. Admin creates case → 201", async () => {
    const res = await request("POST", "/counseling/cases", {
      memberId, counselorId, topic: `Luto ${P}`, startDate: "2026-04-01",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.topic).toBe(`Luto ${P}`);
    expect(res.body.status).toBe("aberto");
    expect(res.body.memberName).toContain("Aconselhado");
    expect(res.body.counselorName).toContain("Conselheiro");
    caseId = res.body.id;
  });

  it("2. Leader cannot create case → 403", async () => {
    const res = await request("POST", "/counseling/cases", {
      memberId, counselorId, topic: "Test", startDate: "2026-04-01",
    }, leaderCk);
    expect(res.status).toBe(403);
  });

  it("3. Member cannot create case → 403", async () => {
    const res = await request("POST", "/counseling/cases", {
      memberId, counselorId, topic: "Test", startDate: "2026-04-01",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("4. Missing fields → 400", async () => {
    const res = await request("POST", "/counseling/cases", { memberId }, adminCk);
    expect(res.status).toBe(400);
  });

  // ─── LIST CASES ───────────────────────────────────────────────────────

  it("5. Admin lists all cases", async () => {
    const res = await request("GET", "/counseling/cases", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.cases.length).toBeGreaterThanOrEqual(1);
  });

  it("6. Leader sees only own cases", async () => {
    const res = await request("GET", "/counseling/cases", undefined, leaderCk);
    expect(res.status).toBe(200);
    // Leader is the counselor, so should see the case
    res.body.cases.forEach((c: any) => expect(c.counselorId).toBe(counselorId));
  });

  it("7. Member cannot list → 403", async () => {
    const res = await request("GET", "/counseling/cases", undefined, memberCk);
    expect(res.status).toBe(403);
  });

  // ─── CASE DETAIL ──────────────────────────────────────────────────────

  it("8. Admin gets case detail", async () => {
    const res = await request("GET", `/counseling/cases/${caseId}`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.topic).toBe(`Luto ${P}`);
    expect(res.body.sessions).toEqual([]);
  });

  it("9. Leader (counselor) gets own case detail", async () => {
    const res = await request("GET", `/counseling/cases/${caseId}`, undefined, leaderCk);
    expect(res.status).toBe(200);
  });

  // ─── CREATE SESSION ───────────────────────────────────────────────────

  it("10. Leader creates session in own case → 201", async () => {
    const res = await request("POST", `/counseling/cases/${caseId}/sessions`, {
      date: "2026-04-05", notes: "Primeira sessão de acolhimento", durationMinutes: 60,
    }, leaderCk);
    expect(res.status).toBe(201);
    expect(res.body.notes).toBe("Primeira sessão de acolhimento");
    expect(res.body.durationMinutes).toBe(60);
    sessionId = res.body.id;
  });

  it("11. Case status auto-updates to em_andamento", async () => {
    const res = await request("GET", `/counseling/cases/${caseId}`, undefined, adminCk);
    expect(res.body.status).toBe("em_andamento");
  });

  it("12. Notes are encrypted in DB", async () => {
    const { rows } = await pool.query(
      "SELECT notes_encrypted FROM counseling_sessions WHERE id = $1",
      [sessionId]
    );
    // Should not be plain text
    expect(rows[0].notes_encrypted).not.toBe("Primeira sessão de acolhimento");
    // Should be a base64 string (encrypted)
    expect(rows[0].notes_encrypted).toBeTruthy();
  });

  it("13. Notes returned decrypted via API", async () => {
    const res = await request("GET", `/counseling/cases/${caseId}/sessions`, undefined, leaderCk);
    expect(res.status).toBe(200);
    expect(res.body.sessions[0].notes).toBe("Primeira sessão de acolhimento");
  });

  it("14. Missing date → 400", async () => {
    const res = await request("POST", `/counseling/cases/${caseId}/sessions`, {
      notes: "test",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  // ─── UPDATE CASE ──────────────────────────────────────────────────────

  it("15. Update case topic", async () => {
    const res = await request("PUT", `/counseling/cases/${caseId}`, {
      topic: `Luto Atualizado ${P}`,
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.topic).toBe(`Luto Atualizado ${P}`);
  });

  it("16. Enclose case sets endDate", async () => {
    const res = await request("PUT", `/counseling/cases/${caseId}`, {
      status: "encerrado",
    }, leaderCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("encerrado");
    expect(res.body.endDate).toBeTruthy();
  });

  // ─── SUMMARY ──────────────────────────────────────────────────────────

  it("17. Summary KPIs", async () => {
    const res = await request("GET", "/counseling/summary", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("openCases");
    expect(res.body).toHaveProperty("inProgressCases");
    expect(res.body).toHaveProperty("closedCases");
    expect(res.body).toHaveProperty("totalSessions");
    expect(res.body.closedCases).toBeGreaterThanOrEqual(1);
    expect(res.body.totalSessions).toBeGreaterThanOrEqual(1);
  });

  // ─── DELETE ───────────────────────────────────────────────────────────

  it("18. Leader cannot delete → 403", async () => {
    const res = await request("DELETE", `/counseling/cases/${caseId}`, undefined, leaderCk);
    expect(res.status).toBe(403);
  });

  it("19. Admin soft deletes case → 200", async () => {
    const cRes = await request("POST", "/counseling/cases", {
      memberId, counselorId, topic: `Del ${P}`, startDate: "2026-05-01",
    }, adminCk);
    const delId = cRes.body.id;

    const res = await request("DELETE", `/counseling/cases/${delId}`, undefined, adminCk);
    expect(res.status).toBe(200);

    const list = await request("GET", "/counseling/cases", undefined, adminCk);
    const ids = list.body.cases.map((c: any) => c.id);
    expect(ids).not.toContain(delId);
  });
});
