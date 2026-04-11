import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin, registerUser, loginUser, assertErrorShape } from "./helpers";

const P = "lgpd-" + crypto.randomUUID().slice(0, 6);

describe("06-lgpd", () => {
  let adminCk: string;
  let memberCk: string;
  let memberEmail: string;
  let memberId: string;
  let noMemberCk: string; // user without associated member

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;

    // Create user + associated member
    memberEmail = `lgpd-mem-${P}@test.local`;
    const { user } = await registerUser(memberEmail, "LgpdPass1234!", `LGPD Member ${P}`);
    const login = await loginUser(memberEmail, "LgpdPass1234!");
    memberCk = login.cookie;

    // Create member record with same email
    const mres = await request("POST", "/members", {
      fullName: `LGPD Member ${P}`, cpf: "55566677788", phone: "21988887777",
      email: memberEmail, lgpdConsentAccepted: true,
      addressZip: "20040020", addressStreet: "Rua do Ouvidor", addressCity: "Rio", addressState: "RJ",
    }, adminCk);
    memberId = mres.body.id;

    // Create a finance entry linked to this member
    await request("POST", "/finance/entries", {
      type: "dizimo", date: "2026-03-10", amount: 200, paymentMethod: "pix", memberId,
    }, adminCk);

    // User without member record
    const noMem = await registerUser(`nomem-${P}@test.local`, "NoMem1234!", "No Member");
    const noMemLogin = await loginUser(`nomem-${P}@test.local`, "NoMem1234!");
    noMemberCk = noMemLogin.cookie;
  });

  it("1. GET my-data", async () => {
    const res = await request("GET", "/lgpd/my-data", undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.member.fullName).toContain("LGPD Member");
    expect(res.body.member.cpfMasked).toBeTruthy();
    expect(res.body.member.phone).toBe("21988887777");
    expect(res.body).toHaveProperty("consents");
    expect(res.body).toHaveProperty("requests");
  });

  it("2. GET my-data without member → 404", async () => {
    const res = await request("GET", "/lgpd/my-data", undefined, noMemberCk);
    expect(res.status).toBe(404);
    assertErrorShape(res);
  });

  it("3. Export data (full CPF, Content-Disposition)", async () => {
    const res = await request("GET", "/lgpd/my-data/export", undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.personalData.cpf).toBe("55566677788");
    expect(res.headers.get("content-disposition")).toContain("meus-dados");
  });

  it("4. My consents", async () => {
    const res = await request("GET", "/lgpd/my-consents", undefined, memberCk);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.consents)).toBe(true);
  });

  it("5. Request correction", async () => {
    const res = await request("POST", "/lgpd/requests", {
      requestType: "correcao", description: "Corrigir endereço",
    }, memberCk);
    expect(res.status).toBe(201);
    expect(res.body.requestType).toBe("correcao");
    expect(res.body.status).toBe("pendente");
  });

  it("6. Request deletion", async () => {
    const res = await request("POST", "/lgpd/requests", {
      requestType: "exclusao", description: "Quero sair",
    }, memberCk);
    expect(res.status).toBe(201);
    expect(res.body.requestType).toBe("exclusao");
  });

  it("7. Request without type → 400", async () => {
    const res = await request("POST", "/lgpd/requests", {
      description: "sem tipo",
    }, memberCk);
    expect(res.status).toBe(400);
    assertErrorShape(res);
  });

  it("8. My requests", async () => {
    const res = await request("GET", "/lgpd/requests/mine", undefined, memberCk);
    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBeGreaterThanOrEqual(2);
  });

  it("9. Admin queue", async () => {
    const res = await request("GET", "/lgpd/requests", undefined, adminCk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("requests");
    expect(res.body).toHaveProperty("total");
  });

  let rejRequestId: string;
  let delRequestId: string;

  it("10. Reject without notes → 400", async () => {
    // Get a request to reject
    const queue = await request("GET", "/lgpd/requests?status=pendente", undefined, adminCk);
    const corrReq = queue.body.requests.find((r: any) => r.requestType === "correcao");
    rejRequestId = corrReq?.id;

    const res = await request("PUT", `/lgpd/requests/${rejRequestId}`, {
      status: "rejeitado",
    }, adminCk);
    expect(res.status).toBe(400);
  });

  it("11. Reject with notes", async () => {
    const res = await request("PUT", `/lgpd/requests/${rejRequestId}`, {
      status: "rejeitado", adminNotes: "Dados estão corretos",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejeitado");
    expect(res.body.adminNotes).toBe("Dados estão corretos");
  });

  it("12. Approve deletion → anonymizes member", async () => {
    // Create a separate member for deletion test (to not affect other tests)
    const delEmail = `lgpd-del-${P}@test.local`;
    await registerUser(delEmail, "DelPass1234!", `Del Member ${P}`);
    const delLogin = await loginUser(delEmail, "DelPass1234!");

    const delMember = await request("POST", "/members", {
      fullName: `Del Member ${P}`, cpf: "99988877766", email: delEmail, lgpdConsentAccepted: true,
    }, adminCk);
    const delMemId = delMember.body.id;

    // Create finance entry for this member
    await request("POST", "/finance/entries", {
      type: "dizimo", date: "2026-03-15", amount: 300, paymentMethod: "pix", memberId: delMemId,
    }, adminCk);

    // Create deletion request
    const delReqRes = await request("POST", "/lgpd/requests", {
      requestType: "exclusao", description: "Excluir dados",
    }, delLogin.cookie);
    delRequestId = delReqRes.body.id;

    // Approve
    const res = await request("PUT", `/lgpd/requests/${delRequestId}`, {
      status: "concluido", adminNotes: "Aprovado conforme LGPD",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("concluido");

    // Verify member anonymized
    const memberCheck = await request("GET", `/members/${delMemId}`, undefined, adminCk);
    expect(memberCheck.body.fullName).toContain("Anonimizado");
    expect(memberCheck.body.status).toBe("inativo");

    // Verify finance anonymized
    const finCheck = await request("GET", "/finance/entries", undefined, adminCk);
    const anonEntries = finCheck.body.entries.filter((e: any) => e.memberName === "[anonimizado]");
    expect(anonEntries.length).toBeGreaterThanOrEqual(1);
  });
});
