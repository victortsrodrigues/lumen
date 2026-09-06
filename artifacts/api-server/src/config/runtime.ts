const isProduction = process.env.NODE_ENV === "production";

function secret(name: "JWT_SECRET" | "CSRF_SECRET" | "FIELD_ENCRYPTION_KEY", developmentFallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProduction) {
    throw new Error(`Missing required production environment variable: ${name}`);
  }
  return developmentFallback;
}

const developmentOrigins = [
  "https://iplumen.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export const runtimeConfig = Object.freeze({
  isProduction,
  jwtSecret: secret("JWT_SECRET", "church-erp-dev-secret-change-in-production"),
  csrfSecret: secret("CSRF_SECRET", "church-erp-csrf-secret-change-in-production"),
  fieldEncryptionKey: secret(
    "FIELD_ENCRYPTION_KEY",
    "church-erp-default-encryption-key-32chars",
  ),
  allowedCorsOrigins: new Set(isProduction ? ["https://iplumen.com"] : developmentOrigins),
});
