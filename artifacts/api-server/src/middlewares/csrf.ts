import type { NextFunction, Request, Response } from "express";
import {
  CSRF_TOKEN_VALIDITY_MS,
  csrfTokensMatch,
  generateCsrfToken,
  validateCsrfToken,
} from "../lib/csrf.js";
import { runtimeConfig } from "../config/runtime.js";

export const CSRF_COOKIE_NAME = "lumen_csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function csrfCookieOptions() {
  return {
    httpOnly: true,
    secure: runtimeConfig.isProduction,
    sameSite: "strict" as const,
    maxAge: CSRF_TOKEN_VALIDITY_MS,
    path: "/",
  };
}

export function issueCsrfToken(req: Request, res: Response): void {
  const current = req.cookies?.[CSRF_COOKIE_NAME];
  const token = typeof current === "string" && validateCsrfToken(current)
    ? current
    : generateCsrfToken();

  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  res.setHeader("Cache-Control", "no-store");
  res.json({ csrfToken: token });
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const headerToken = req.get("x-csrf-token");
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (
    typeof headerToken !== "string" ||
    typeof cookieToken !== "string" ||
    !validateCsrfToken(headerToken) ||
    !csrfTokensMatch(headerToken, cookieToken)
  ) {
    res.status(403).json({
      error: "CSRF_ERROR",
      message: "Sua sessão de segurança expirou. Tente novamente.",
    });
    return;
  }

  next();
}
