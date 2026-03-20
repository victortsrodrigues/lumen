import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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

  req.user = payload;
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
