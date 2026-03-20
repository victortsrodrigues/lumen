import { Router, type IRouter, Request, Response } from "express";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { db, usersTable, consentRecordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { generateCsrfToken, validateCsrfToken } from "../lib/csrf.js";
import { createAuditLog } from "../lib/audit.js";
import { checkLoginRateLimit, resetLoginRateLimit } from "../lib/rateLimit.js";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function setAuthCookie(res: Response, token: string): void {
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 1000,
    path: "/",
  });
}

router.get("/csrf", (_req, res) => {
  const token = generateCsrfToken();
  res.json({ csrfToken: token });
});

router.post("/register", async (req: Request, res: Response) => {
  const { email, password, name, consentAccepted } = req.body;
  const ip = getClientIp(req);

  if (!email || !password || !name) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios ausentes" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Senha deve ter pelo menos 8 caracteres" });
    return;
  }
  if (!consentAccepted) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Consentimento necessário" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "EMAIL_IN_USE", message: "E-mail já cadastrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    passwordHash,
    name,
    role: "member",
    mfaEnabled: false,
  }).returning();

  await db.insert(consentRecordsTable).values({
    userId: user.id,
    consentType: "terms_of_service",
    accepted: true,
    ipAddress: ip,
  });

  await createAuditLog({ userId: user.id, action: "USER_REGISTERED", resourceType: "user", resourceId: user.id, ipAddress: ip });

  const token = signToken({ userId: user.id, email: user.email, role: user.role, mfaVerified: false });
  setAuthCookie(res, token);

  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, mfaEnabled: user.mfaEnabled, mfaVerified: false, createdAt: user.createdAt },
    requiresMfa: false,
    message: "Conta criada com sucesso",
  });
});

router.post("/login", async (req: Request, res: Response) => {
  const { email, password, csrfToken } = req.body;
  const ip = getClientIp(req);

  if (!csrfToken || !validateCsrfToken(csrfToken)) {
    res.status(400).json({ error: "CSRF_ERROR", message: "Token CSRF inválido" });
    return;
  }

  const rateCheck = checkLoginRateLimit(ip);
  if (!rateCheck.allowed) {
    res.status(429).json({ error: "RATE_LIMIT", message: `Muitas tentativas. Tente novamente em ${Math.ceil((rateCheck.retryAfter ?? 900) / 60)} minutos` });
    return;
  }

  if (!email || !password) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail e senha obrigatórios" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

  if (!user) {
    await createAuditLog({ userId: "unknown", action: "LOGIN_FAILED", details: { email, reason: "user_not_found" }, ipAddress: ip });
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "E-mail ou senha inválidos" });
    return;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    await createAuditLog({ userId: user.id, action: "LOGIN_FAILED", details: { reason: "wrong_password" }, ipAddress: ip });
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "E-mail ou senha inválidos" });
    return;
  }

  resetLoginRateLimit(ip);

  const requiresMfa = user.role === "admin" && user.mfaEnabled;
  const mfaVerified = !requiresMfa;

  const token = signToken({ userId: user.id, email: user.email, role: user.role, mfaVerified });
  setAuthCookie(res, token);

  await createAuditLog({ userId: user.id, action: "LOGIN_SUCCESS", ipAddress: ip });

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, mfaEnabled: user.mfaEnabled, mfaVerified, createdAt: user.createdAt },
    requiresMfa: user.role === "admin" && user.mfaEnabled && !mfaVerified,
    message: "Login realizado com sucesso",
  });
});

router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (req.user) {
    await createAuditLog({ userId: req.user.userId, action: "LOGOUT", ipAddress: ip });
  }
  res.clearCookie("auth_token", { path: "/" });
  res.json({ message: "Logout realizado com sucesso" });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user) {
    res.clearCookie("auth_token");
    res.status(401).json({ error: "UNAUTHORIZED", message: "Usuário não encontrado" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mfaEnabled: user.mfaEnabled,
    mfaVerified: req.user!.mfaVerified,
    createdAt: user.createdAt,
  });
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email, csrfToken } = req.body;
  const ip = getClientIp(req);

  if (!csrfToken || !validateCsrfToken(csrfToken)) {
    res.status(400).json({ error: "CSRF_ERROR", message: "Token CSRF inválido" });
    return;
  }

  if (!email) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail obrigatório" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

  if (user) {
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(usersTable).set({ resetToken, resetTokenExpiresAt: expiresAt }).where(eq(usersTable.id, user.id));
    await createAuditLog({ userId: user.id, action: "PASSWORD_RESET_REQUESTED", ipAddress: ip });
    req.log?.info({ userId: user.id, resetToken }, "Password reset token generated");
  }

  res.json({ message: "Se o e-mail existir, você receberá as instruções de recuperação" });
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const { token, password, csrfToken } = req.body;
  const ip = getClientIp(req);

  if (!csrfToken || !validateCsrfToken(csrfToken)) {
    res.status(400).json({ error: "CSRF_ERROR", message: "Token CSRF inválido" });
    return;
  }

  if (!token || !password || password.length < 8) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Dados inválidos" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, token)).limit(1);

  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    res.status(400).json({ error: "INVALID_TOKEN", message: "Token inválido ou expirado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(usersTable).set({ passwordHash, resetToken: null, resetTokenExpiresAt: null, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
  await createAuditLog({ userId: user.id, action: "PASSWORD_RESET", ipAddress: ip });

  res.json({ message: "Senha redefinida com sucesso" });
});

router.post("/mfa/setup", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Usuário não encontrado" });
    return;
  }

  const secret = speakeasy.generateSecret({ name: `Church ERP (${user.email})`, length: 20 });
  const backupCodes = Array.from({ length: 8 }, () => crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase());

  await db.update(usersTable).set({
    mfaSecret: secret.base32,
    mfaBackupCodes: JSON.stringify(backupCodes),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId));

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

  res.json({
    secret: secret.base32,
    qrCodeUrl,
    backupCodes,
  });
});

router.post("/mfa/verify", requireAuth, async (req: Request, res: Response) => {
  const { code, csrfToken } = req.body;
  const ip = getClientIp(req);

  if (!csrfToken || !validateCsrfToken(csrfToken)) {
    res.status(400).json({ error: "CSRF_ERROR", message: "Token CSRF inválido" });
    return;
  }

  const userId = req.user!.userId;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user || !user.mfaSecret) {
    res.status(400).json({ error: "MFA_NOT_SETUP", message: "MFA não configurado" });
    return;
  }

  const isValid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: "base32", token: code, window: 1 });

  if (!isValid) {
    let isBackupCode = false;
    if (user.mfaBackupCodes) {
      const backupCodes: string[] = JSON.parse(user.mfaBackupCodes);
      const idx = backupCodes.indexOf(code.toUpperCase());
      if (idx !== -1) {
        isBackupCode = true;
        backupCodes.splice(idx, 1);
        await db.update(usersTable).set({ mfaBackupCodes: JSON.stringify(backupCodes) }).where(eq(usersTable.id, userId));
      }
    }
    if (!isBackupCode) {
      await createAuditLog({ userId, action: "MFA_FAILED", ipAddress: ip });
      res.status(400).json({ error: "INVALID_CODE", message: "Código MFA inválido" });
      return;
    }
  }

  if (!user.mfaEnabled) {
    await db.update(usersTable).set({ mfaEnabled: true, updatedAt: new Date() }).where(eq(usersTable.id, userId));
  }

  await createAuditLog({ userId, action: "MFA_VERIFIED", ipAddress: ip });

  const token = signToken({ userId: user.id, email: user.email, role: user.role, mfaVerified: true });
  setAuthCookie(res, token);

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, mfaEnabled: true, mfaVerified: true, createdAt: user.createdAt },
    requiresMfa: false,
    message: "MFA verificado com sucesso",
  });
});

export default router;
