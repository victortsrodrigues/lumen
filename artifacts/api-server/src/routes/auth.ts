import { Router, type IRouter, Request, Response } from "express";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { RegisterBody } from "@workspace/api-zod";
import {
  authTokensTable,
  consentRecordsTable,
  db,
  emailOutboxTable,
  usersTable,
} from "@workspace/db";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { createAuditLog } from "../lib/audit.js";
import { checkActionRateLimit, checkLoginRateLimit, resetLoginRateLimit } from "../lib/rateLimit.js";
import { requireAuth } from "../middlewares/auth.js";
import { issueCsrfToken } from "../middlewares/csrf.js";
import { notifyRole } from "../lib/notifications.js";
import { deleteOwnAccountData, LastActiveAdminError } from "../lib/accountDeletion.js";
import {
  assertEmailDeliveryConfigured,
  cancelPendingAuthEmails,
  dispatchEmailOutboxItem,
  hashAuthToken,
  isEmailDeliveryConfigured,
  isEmailVerificationRequired,
  prepareAuthEmail,
  queueAuthEmail,
  recentlyIssuedAuthToken,
} from "../lib/email.js";

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

router.get("/csrf", issueCsrfToken);

router.post("/register", async (req: Request, res: Response) => {
  const { email, password, name, consentAccepted, legalDocumentsVersion } = req.body;
  const ip = getClientIp(req);

  if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string") {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios ausentes" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 120) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Nome inválido" });
    return;
  }
  if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail inválido" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Senha deve ter pelo menos 8 caracteres" });
    return;
  }
  if (password.length > 128) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Senha excede o tamanho permitido" });
    return;
  }
  if (consentAccepted !== true) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Leia a Política de Privacidade e aceite os Termos de Uso para criar sua conta." });
    return;
  }
  const legalVersion = RegisterBody.shape.legalDocumentsVersion.safeParse(legalDocumentsVersion);
  if (!legalVersion.success) {
    res.status(409).json({
      error: "LEGAL_DOCUMENTS_UPDATED",
      message: "Recarregue a página e leia a versão atual da Política de Privacidade e dos Termos de Uso antes de continuar.",
    });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "EMAIL_IN_USE", message: "E-mail já cadastrado" });
    return;
  }

  const emailVerificationRequired = isEmailVerificationRequired();
  if (emailVerificationRequired) {
    try {
      assertEmailDeliveryConfigured();
    } catch {
      req.log?.error("Registration requires email delivery, but the service is not ready");
      res.status(503).json({
        error: "EMAIL_SERVICE_UNAVAILABLE",
        message: "O cadastro está temporariamente indisponível. Tente novamente mais tarde.",
      });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await db.transaction(async (tx) => {
    const [user] = await tx.insert(usersTable).values({
      email: normalizedEmail,
      passwordHash,
      name: normalizedName,
      role: "member",
      status: "pending",
      requestedAt: new Date(),
      emailVerifiedAt: emailVerificationRequired ? null : new Date(),
      mfaEnabled: false,
    }).returning();

    // Terms acceptance and notice acknowledgment are NOT blanket consent for
    // sensitive data. Keep the exact presented version; never backfill old users.
    await tx.insert(consentRecordsTable).values([{
      userId: user.id,
      consentType: `terms_of_service@${legalVersion.data}`,
      accepted: true,
      ipAddress: ip,
    }, {
      userId: user.id,
      consentType: `privacy_notice@${legalVersion.data}`,
      accepted: true,
      ipAddress: ip,
    }]);

    if (!emailVerificationRequired) return { user, outboxId: null as string | null };
    const prepared = prepareAuthEmail(user, "verify_email");
    await tx.insert(authTokensTable).values(prepared.token);
    await tx.insert(emailOutboxTable).values(prepared.outbox);
    return { user, outboxId: prepared.outbox.id! };
  });
  const { user, outboxId } = created;

  await createAuditLog({ userId: user.id, action: "ACCOUNT_REQUESTED", resourceType: "user", resourceId: user.id, ipAddress: ip });

  await notifyRole("admin", {
    type: "account.requested",
    title: "Nova solicitação de acesso",
    message: `${user.name} solicitou acesso à plataforma.`,
    link: "/admin/accounts?status=pending",
    entityType: "user",
    entityId: user.id,
  });

  if (outboxId) void dispatchEmailOutboxItem(outboxId);

  res.status(202).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabled,
      mfaVerified: false,
      createdAt: user.createdAt,
    },
    requiresMfa: false,
    emailVerificationRequired,
    message: emailVerificationRequired
      ? "Solicitação enviada. Confirme seu e-mail e aguarde a aprovação."
      : "Solicitação enviada. Você poderá acessar após a aprovação.",
  });
});

router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const ip = getClientIp(req);

  const rateCheck = checkLoginRateLimit(ip);
  if (!rateCheck.allowed) {
    res.status(429).json({ error: "RATE_LIMIT", message: `Muitas tentativas. Tente novamente em ${Math.ceil((rateCheck.retryAfter ?? 900) / 60)} minutos` });
    return;
  }

  if (!email || !password) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail e senha obrigatórios" });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);

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

  // A correct password should not consume the invalid-credentials allowance,
  // even when the account is still pending or administratively disabled.
  resetLoginRateLimit(ip);

  const unavailable: Record<string, { error: string; message: string }> = {
    pending: { error: "ACCOUNT_PENDING", message: "Sua solicitação ainda aguarda aprovação" },
    rejected: { error: "ACCOUNT_REJECTED", message: "Sua solicitação não foi aprovada. Entre em contato com a administração." },
    blocked: { error: "ACCOUNT_BLOCKED", message: "Sua conta está temporariamente bloqueada" },
    revoked: { error: "ACCOUNT_REVOKED", message: "O acesso desta conta foi revogado" },
    deleting: { error: "ACCOUNT_DELETING", message: "A exclusão desta conta está em processamento" },
  };
  if (!["active", "pending"].includes(user.status)) {
    const statusError = unavailable[user.status];
    await createAuditLog({
      userId: user.id,
      action: "LOGIN_DENIED",
      details: { accountStatus: user.status },
      ipAddress: ip,
    });
    res.status(403).json(statusError);
    return;
  }
  if (isEmailVerificationRequired() && !user.emailVerifiedAt) {
    await createAuditLog({
      userId: user.id,
      action: "LOGIN_DENIED",
      details: { reason: "email_not_verified" },
      ipAddress: ip,
    });
    res.status(403).json({
      error: "EMAIL_NOT_VERIFIED",
      message: "Confirme seu e-mail antes de acessar a plataforma",
    });
    return;
  }
  if (user.status === "pending") {
    await createAuditLog({
      userId: user.id,
      action: "LOGIN_DENIED",
      details: { accountStatus: user.status },
      ipAddress: ip,
    });
    res.status(403).json(unavailable.pending);
    return;
  }

  const requiresMfa = user.role === "admin" && user.mfaEnabled;
  const mfaVerified = !requiresMfa;

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    memberId: user.memberId,
    mfaVerified,
    sessionVersion: user.sessionVersion,
  });
  setAuthCookie(res, token);

  await db.update(usersTable).set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  await createAuditLog({ userId: user.id, action: "LOGIN_SUCCESS", ipAddress: ip });

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, emailVerifiedAt: user.emailVerifiedAt, mfaEnabled: user.mfaEnabled, mfaVerified, createdAt: user.createdAt },
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
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    memberId: user.memberId,
    mfaEnabled: user.mfaEnabled,
    mfaVerified: req.user!.mfaVerified,
    createdAt: user.createdAt,
  });
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body;
  const ip = getClientIp(req);

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail obrigatório" });
    return;
  }
  if (process.env.NODE_ENV === "production" && !isEmailDeliveryConfigured()) {
    res.status(503).json({
      error: "EMAIL_SERVICE_UNAVAILABLE",
      message: "A recuperação de senha está temporariamente indisponível.",
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail inválido" });
    return;
  }
  const genericMessage = "Se o e-mail existir, você receberá as instruções de recuperação";
  const rateCheck = checkActionRateLimit(`forgot-password:${ip}:${normalizedEmail}`, {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  });
  if (!rateCheck.allowed) {
    res.json({ message: genericMessage });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);

  if (user) {
    try {
      if (!(await recentlyIssuedAuthToken(user.id, "reset_password"))) {
        const { outboxId } = await queueAuthEmail(user, "reset_password");
        await createAuditLog({ userId: user.id, action: "PASSWORD_RESET_REQUESTED", ipAddress: ip });
        void dispatchEmailOutboxItem(outboxId);
      }
    } catch {
      req.log?.error({ userId: user.id }, "Could not queue password reset email");
    }
  }

  res.json({ message: genericMessage });
});

router.post("/resend-verification", async (req: Request, res: Response) => {
  const { email } = req.body;
  const ip = getClientIp(req);
  const genericMessage = "Se houver uma conta aguardando verificação, enviaremos uma nova mensagem";
  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail obrigatório" });
    return;
  }
  if (process.env.NODE_ENV === "production" && !isEmailDeliveryConfigured()) {
    res.status(503).json({
      error: "EMAIL_SERVICE_UNAVAILABLE",
      message: "O envio de verificação está temporariamente indisponível.",
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "E-mail inválido" });
    return;
  }
  const rateCheck = checkActionRateLimit(`resend-verification:${ip}:${normalizedEmail}`, {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  });
  if (!rateCheck.allowed) {
    res.json({ message: genericMessage });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (user && !user.emailVerifiedAt && user.status !== "deleting") {
    try {
      if (!(await recentlyIssuedAuthToken(user.id, "verify_email"))) {
        const { outboxId } = await queueAuthEmail(user, "verify_email");
        await createAuditLog({ userId: user.id, action: "EMAIL_VERIFICATION_REQUESTED", ipAddress: ip });
        void dispatchEmailOutboxItem(outboxId);
      }
    } catch {
      req.log?.error({ userId: user.id }, "Could not queue email verification");
    }
  }

  res.json({ message: genericMessage });
});

router.post("/verify-email", async (req: Request, res: Response) => {
  const { token } = req.body;
  const ip = getClientIp(req);
  if (typeof token !== "string" || token.length < 32 || token.length > 512) {
    res.status(400).json({ error: "INVALID_TOKEN", message: "Link inválido ou expirado" });
    return;
  }
  const rateCheck = checkActionRateLimit(`verify-email:${ip}`, {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  });
  if (!rateCheck.allowed) {
    res.status(429).json({ error: "RATE_LIMIT", message: "Muitas tentativas. Tente novamente mais tarde." });
    return;
  }

  const [record] = await db.select().from(authTokensTable).where(and(
    eq(authTokensTable.tokenHash, hashAuthToken(token)),
    eq(authTokensTable.purpose, "verify_email"),
    isNull(authTokensTable.usedAt),
    gt(authTokensTable.expiresAt, new Date()),
  )).limit(1);
  if (!record) {
    res.status(400).json({ error: "INVALID_TOKEN", message: "Link inválido ou expirado" });
    return;
  }

  const verified = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(authTokensTable).set({ usedAt: new Date() }).where(and(
      eq(authTokensTable.id, record.id),
      isNull(authTokensTable.usedAt),
      gt(authTokensTable.expiresAt, new Date()),
    )).returning();
    if (!claimed) return false;

    await tx.update(usersTable).set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.id, record.userId));
    await tx.update(authTokensTable).set({ usedAt: new Date() }).where(and(
      eq(authTokensTable.userId, record.userId),
      eq(authTokensTable.purpose, "verify_email"),
      isNull(authTokensTable.usedAt),
    ));
    await tx.update(emailOutboxTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(
      eq(emailOutboxTable.userId, record.userId),
      eq(emailOutboxTable.template, "email_verification"),
      inArray(emailOutboxTable.status, ["pending", "processing"]),
    ));
    return true;
  });
  if (!verified) {
    res.status(400).json({ error: "INVALID_TOKEN", message: "Link inválido ou expirado" });
    return;
  }

  await createAuditLog({ userId: record.userId, action: "EMAIL_VERIFIED", ipAddress: ip });
  res.json({ message: "E-mail confirmado com sucesso. Aguarde a aprovação da sua conta." });
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const { token, password } = req.body;
  const ip = getClientIp(req);

  if (typeof token !== "string" || token.length < 32 || token.length > 512
    || typeof password !== "string" || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Dados inválidos" });
    return;
  }
  const rateCheck = checkActionRateLimit(`reset-password:${ip}`, {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  });
  if (!rateCheck.allowed) {
    res.status(429).json({ error: "RATE_LIMIT", message: "Muitas tentativas. Tente novamente mais tarde." });
    return;
  }

  const [record] = await db.select().from(authTokensTable).where(and(
    eq(authTokensTable.tokenHash, hashAuthToken(token)),
    eq(authTokensTable.purpose, "reset_password"),
    isNull(authTokensTable.usedAt),
    gt(authTokensTable.expiresAt, new Date()),
  )).limit(1);
  if (!record) {
    res.status(400).json({ error: "INVALID_TOKEN", message: "Token inválido ou expirado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const reset = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(authTokensTable).set({ usedAt: new Date() }).where(and(
      eq(authTokensTable.id, record.id),
      isNull(authTokensTable.usedAt),
      gt(authTokensTable.expiresAt, new Date()),
    )).returning();
    if (!claimed) return false;

    await tx.update(usersTable).set({
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
      sessionVersion: sql`${usersTable.sessionVersion} + 1`,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, record.userId));
    await tx.update(authTokensTable).set({ usedAt: new Date() }).where(and(
      eq(authTokensTable.userId, record.userId),
      eq(authTokensTable.purpose, "reset_password"),
      isNull(authTokensTable.usedAt),
    ));
    return true;
  });
  if (!reset) {
    res.status(400).json({ error: "INVALID_TOKEN", message: "Token inválido ou expirado" });
    return;
  }
  await cancelPendingAuthEmails(record.userId, "reset_password");
  await createAuditLog({ userId: record.userId, action: "PASSWORD_RESET", ipAddress: ip });
  res.clearCookie("auth_token", { path: "/" });

  res.json({ message: "Senha redefinida com sucesso" });
});

router.delete("/account", requireAuth, async (req: Request, res: Response) => {
  const { password, confirmation } = req.body;
  if (!password || confirmation !== "EXCLUIR") {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Informe sua senha e digite EXCLUIR para confirmar",
    });
    return;
  }

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "INVALID_PASSWORD", message: "Senha atual incorreta" });
    return;
  }

  try {
    const result = await deleteOwnAccountData(user.id);
    res.clearCookie("auth_token", { path: "/" });
    res.json({
      message: "Sua conta e seus dados pessoais foram excluídos",
      deletionReference: result.deletionReference,
    });
  } catch (error) {
    if (error instanceof LastActiveAdminError) {
      res.status(409).json({ error: "LAST_ACTIVE_ADMIN", message: error.message });
      return;
    }
    throw error;
  }
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
  const { code } = req.body;
  const ip = getClientIp(req);

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

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    memberId: user.memberId,
    mfaVerified: true,
    sessionVersion: user.sessionVersion,
  });
  setAuthCookie(res, token);

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, mfaEnabled: true, mfaVerified: true, createdAt: user.createdAt },
    requiresMfa: false,
    message: "MFA verificado com sucesso",
  });
});

export default router;
