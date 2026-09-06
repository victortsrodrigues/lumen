import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";
import { runtimeConfig } from "../config/runtime.js";

export function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || runtimeConfig.allowedCorsOrigins.has(origin);
}

export function enforceAllowedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  if (!isAllowedOrigin(origin)) {
    res.status(403).json({
      error: "ORIGIN_NOT_ALLOWED",
      message: "Origem não autorizada",
    });
    return;
  }
  next();
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Accept", "Authorization", "Content-Type", "X-CSRF-Token"],
  maxAge: 600,
};
