import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.auth_token;
  if (!token) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Autenticação necessária" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.clearCookie("auth_token");
    res.status(401).json({ error: "UNAUTHORIZED", message: "Sessão expirada" });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    role: usersTable.role,
    memberId: usersTable.memberId,
    status: usersTable.status,
    sessionVersion: usersTable.sessionVersion,
  }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);

  const tokenVersion = payload.sessionVersion ?? 1;
  if (!user || user.status !== "active" || user.sessionVersion !== tokenVersion) {
    res.clearCookie("auth_token", { path: "/" });
    res.status(401).json({
      error: "SESSION_REVOKED",
      message: "Sua sessão não está mais ativa",
    });
    return;
  }

  // Authorization always uses the current database state. This makes role
  // changes and access revocation effective immediately, even for old JWTs.
  req.user = {
    userId: user.id,
    email: user.email,
    role: user.role,
    memberId: user.memberId,
    mfaVerified: payload.mfaVerified,
    sessionVersion: user.sessionVersion,
  };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Autenticação necessária" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "FORBIDDEN", message: "Acesso negado" });
      return;
    }
    next();
  };
}

export function requireMfaVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Autenticação necessária" });
    return;
  }
  if (req.user.role === "admin" && !req.user.mfaVerified) {
    res.status(403).json({ error: "MFA_REQUIRED", message: "MFA necessário para administradores" });
    return;
  }
  next();
}
