import jwt from "jsonwebtoken";
import { runtimeConfig } from "../config/runtime.js";

const JWT_EXPIRY = "1h";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  memberId: string | null;
  mfaVerified: boolean;
  sessionVersion: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, runtimeConfig.jwtSecret, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, runtimeConfig.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}
