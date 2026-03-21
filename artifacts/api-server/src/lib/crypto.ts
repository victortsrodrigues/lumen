import crypto from "crypto";

const ENCRYPTION_KEY_RAW = process.env.FIELD_ENCRYPTION_KEY || "church-erp-default-encryption-key-32chars";
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY_RAW, "church-erp-salt", KEY_LENGTH);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function hashForSearch(value: string): string {
  const normalized = value.replace(/\D/g, "");
  return crypto.createHash("sha256").update(normalized + "church-erp-hash-salt").digest("hex");
}

export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return "***.***.***.--";
  return `***.***.***.${digits.slice(9)}`;
}

export function encryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

export function decryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}
