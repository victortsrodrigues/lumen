import { describe, it, expect, beforeAll } from "vitest";
import { request, registerAdmin } from "./helpers";

const P = "stor-" + crypto.randomUUID().slice(0, 6);

describe("07-storage", () => {
  let adminCk: string;
  let uploadedObjectId: string;

  beforeAll(async () => {
    const a = await registerAdmin(`${P}-a`);
    adminCk = a.cookie;
  });

  it("1. Request upload URL", async () => {
    const res = await request("POST", "/storage/uploads/request-url", {
      name: "test-photo.jpg", size: 1024, contentType: "image/jpeg",
    }, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.uploadURL).toBeTruthy();
    expect(res.body.objectPath).toMatch(/^\/objects\//);
    // Extract objectId from uploadURL for later upload
    const match = res.body.uploadURL.match(/upload-target\/(.+)$/);
    if (match) uploadedObjectId = match[1];
  });

  it("2. Request URL without fields → 400", async () => {
    const res = await request("POST", "/storage/uploads/request-url", {}, adminCk);
    expect(res.status).toBe(400);
  });

  it("3. Upload file", async () => {
    // First get URL
    const urlRes = await request("POST", "/storage/uploads/request-url", {
      name: "test-upload.txt", size: 11, contentType: "text/plain",
    }, adminCk);
    const match = urlRes.body.uploadURL.match(/upload-target\/(.+)$/);
    const objId = match![1];

    const fileBuffer = Buffer.from("hello world");
    const res = await request("PUT", `/storage/upload-target/${objId}`, fileBuffer, adminCk);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.path).toContain(objId);
    uploadedObjectId = objId;
  });

  it("4. Path traversal (..) → blocked", async () => {
    const res = await request("PUT", "/storage/upload-target/..", Buffer.from("x"), adminCk);
    // Express may return 404 (route not matched) or 400 (validation)
    expect([400, 404]).toContain(res.status);
  });

  it("5. Path traversal (%2e%2e) → blocked", async () => {
    const res = await request("PUT", "/storage/upload-target/%2e%2e", Buffer.from("x"), adminCk);
    expect([400, 404]).toContain(res.status);
  });

  it("6. Path traversal with slash → 400", async () => {
    const res = await request("PUT", "/storage/upload-target/a/b", Buffer.from("x"), adminCk);
    // Express may return 404 for unmatched route or 400
    expect([400, 404]).toContain(res.status);
  });

  it("7. Download uploaded file", async () => {
    const res = await fetch(`http://localhost:3000/api/storage/objects/uploads/${uploadedObjectId}`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("hello world");
  });
});
