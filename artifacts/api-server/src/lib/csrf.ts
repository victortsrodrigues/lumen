import crypto from "crypto";
import { runtimeConfig } from "../config/runtime.js";

export const CSRF_TOKEN_VALIDITY_MS = 30 * 60 * 1000;

export function generateCsrfToken(): string {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(32).toString("hex");
  const data = `${timestamp}:${random}`;
  const hmac = crypto.createHmac("sha256", runtimeConfig.csrfSecret).update(data).digest("hex");
  return `${data}:${hmac}`;
}

export function validateCsrfToken(token: string): boolean {
  if (!token) return false;
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  const [timestamp, random, hmac] = parts;
  if (!timestamp || !random || !hmac) return false;
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(random) || !/^[a-f0-9]{64}$/.test(hmac)) {
    return false;
  }
  const data = `${timestamp}:${random}`;
  const expectedHmac = crypto.createHmac("sha256", runtimeConfig.csrfSecret).update(data).digest("hex");
  const supplied = Buffer.from(hmac);
  const expected = Buffer.from(expectedHmac);
  if (supplied.length !== expected.length) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  const isValid = crypto.timingSafeEqual(supplied, expected);
  const isNotExpired = age >= 0 && age < CSRF_TOKEN_VALIDITY_MS;
  return isValid && isNotExpired;
}

export function csrfTokensMatch(left: string, right: string): boolean {
  const supplied = Buffer.from(left);
  const expected = Buffer.from(right);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
