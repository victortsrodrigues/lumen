import crypto from "crypto";

const CSRF_SECRET = process.env.CSRF_SECRET || "church-erp-csrf-secret-change-in-production";
const TOKEN_VALIDITY_MS = 30 * 60 * 1000;

export function generateCsrfToken(): string {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString("hex");
  const data = `${timestamp}:${random}`;
  const hmac = crypto.createHmac("sha256", CSRF_SECRET).update(data).digest("hex");
  return `${data}:${hmac}`;
}

export function validateCsrfToken(token: string): boolean {
  if (!token) return false;
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  const [timestamp, random, hmac] = parts;
  if (!timestamp || !random || !hmac) return false;
  const data = `${timestamp}:${random}`;
  const expectedHmac = crypto.createHmac("sha256", CSRF_SECRET).update(data).digest("hex");
  const supplied = Buffer.from(hmac);
  const expected = Buffer.from(expectedHmac);
  if (supplied.length !== expected.length) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  const isValid = crypto.timingSafeEqual(supplied, expected);
  const isNotExpired = age >= 0 && age < TOKEN_VALIDITY_MS;
  return isValid && isNotExpired;
}
