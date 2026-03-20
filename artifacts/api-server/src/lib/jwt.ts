import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "church-erp-dev-secret-change-in-production";
const JWT_EXPIRY = "1h";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  mfaVerified: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
