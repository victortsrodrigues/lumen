import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerLeader, registerMember } from "./helpers";

const P = "pipe-" + crypto.randomUUID().slice(0, 6);

describe("16-pipeline", () => {
  let adminCk: string;
  let leaderCk: string;
  let memberCk: string;
  let memberEmail: string;
  let memberId: string;
  let memberBId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
    const l = await registerLeader(`${P}-l`);
    leaderCk = l.cookie;
    const m = await registerMember(`${P}-m`);
    memberCk = m.cookie;
    memberEmail = m.email;

    // Create members (default pipelineStage = "culto")
    const mRes = await request("POST", "/members", {
      fullName: `PipeMemberA ${P}`, email: memberEmail, lgpdConsentAccepted: true,
    }, adminCk);
    memberId = mRes.body.id;

    const mbRes = await request("POST", "/members", {
      fullName: `PipeMemberB ${P}`, email: `member-${P}-b@test.local`, lgpdConsentAccepted: true,
    }, adminCk);
    memberBId = mbRes.body.id;
  });

  it("1. Summary returns count by stage", async () => {
    const res = await request("GET", "/members/pipeline/summary", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.total).toBe("number");
    expect(res.body.total).toBeGreaterThan(0);
  });

  it("2. Move member stage (admin)", async () => {
    const res = await request("PUT", `/members/${memberId}/pipeline`, {
      stage: "pequeno_grupo", reason: "Começou a frequentar pequeno grupo",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.fromStage).toBe("culto");
    expect(res.body.toStage).toBe("pequeno_grupo");
  });

  it("3. Leader can move", async () => {
    const res = await request("PUT", `/members/${memberId}/pipeline`, {
      stage: "ministerio", reason: "Entrou em ministério",
    }, leaderCk);
    expect(res.status).toBe(200);
    expect(res.body.toStage).toBe("ministerio");
  });

  it("4. Member cannot move → 403", async () => {
    const res = await request("PUT", `/members/${memberId}/pipeline`, {
      stage: "culto",
    }, memberCk);
    expect(res.status).toBe(403);
  });

  it("5. Invalid stage → 400", async () => {
    const res = await request("PUT", `/members/${memberId}/pipeline`, {
      stage: "invalido",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("6. History recorded after move", async () => {
    const res = await request("GET", `/members/${memberId}/pipeline`, undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBe("ministerio");
    expect(res.body.history.length).toBeGreaterThanOrEqual(2);
  });

  it("7. History shows fromStage and toStage", async () => {
    const res = await request("GET", `/members/${memberId}/pipeline`, undefined, adminCk);
    const latest = res.body.history[0];
    expect(latest.fromStage).toBe("pequeno_grupo");
    expect(latest.toStage).toBe("ministerio");
  });

  it("8. Move nonexistent member → 404", async () => {
    const res = await request("PUT", "/members/nonexistent/pipeline", { stage: "culto" }, adminCk);
    expect(res.status).toBe(404);
  });

  it("9. Member sees own history", async () => {
    const res = await request("GET", `/members/${memberId}/pipeline`, undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.history.length).toBeGreaterThan(0);
  });

  it("10. Member cannot see other's history → 403", async () => {
    const res = await request("GET", `/members/${memberBId}/pipeline`, undefined, memberCk);
    expect(res.status).toBe(403);
  });

  it("11. Stagnant returns members", async () => {
    const res = await request("GET", "/members/pipeline/stagnant", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.thresholdDays).toBe(90);
    expect(Array.isArray(res.body.stagnant)).toBe(true);
  });

  it("12. Stagnant with custom days", async () => {
    const res = await request("GET", "/members/pipeline/stagnant?days=30", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.thresholdDays).toBe(30);
  });

  it("13. Create member with custom pipelineStage", async () => {
    const res = await request("POST", "/members", {
      fullName: `PipeCustom ${P}`, email: `pipecustom-${P}@test.local`,
      lgpdConsentAccepted: true, pipelineStage: "ministerio",
    }, adminCk);
    expect(res.status).toBe(201);
    expect(res.body.pipelineStage).toBe("ministerio");
  });

  it("14. Listing includes pipelineStage", async () => {
    const res = await request("GET", "/members", undefined, adminCk);
    expect(res.status).toBe(200);
    const m = res.body.members.find((x: any) => x.id === memberId);
    expect(m).toBeDefined();
    expect(m.pipelineStage).toBe("ministerio");
  });

  it("15. Summary correct after changes", async () => {
    const res = await request("GET", "/members/pipeline/summary", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.summary.ministerio).toBeGreaterThanOrEqual(2);
  });
});
