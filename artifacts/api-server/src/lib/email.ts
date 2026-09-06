import crypto from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import {
  authTokensTable,
  db,
  emailOutboxTable,
  type User,
} from "@workspace/db";
import { decrypt, encrypt } from "./crypto.js";
import { logger } from "./logger.js";

export type AuthEmailPurpose = "verify_email" | "reset_password";
type AuthEmailTemplate = "email_verification" | "password_reset";

type AuthEmailPayload = {
  name: string;
  to: string;
  link: string;
  template: AuthEmailTemplate;
};

type PreparedAuthEmail = {
  token: typeof authTokensTable.$inferInsert;
  outbox: typeof emailOutboxTable.$inferInsert;
};

const TOKEN_TTLS: Record<AuthEmailPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};

const TEMPLATE_BY_PURPOSE: Record<AuthEmailPurpose, AuthEmailTemplate> = {
  verify_email: "email_verification",
  reset_password: "password_reset",
};

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const PROCESS_INTERVAL_MS = 15_000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function envEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function isEmailVerificationRequired(): boolean {
  return envEnabled(process.env.EMAIL_VERIFICATION_REQUIRED);
}

export function isEmailDeliveryConfigured(): boolean {
  const providerReady = (
    process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "resend" &&
    Boolean(process.env.RESEND_API_KEY?.trim()) &&
    Boolean(process.env.EMAIL_FROM?.trim())
  );
  if (!providerReady) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(process.env.FIELD_ENCRYPTION_KEY && process.env.APP_PUBLIC_URL?.trim());
}

export function assertEmailDeliveryConfigured(): void {
  if (!isEmailDeliveryConfigured()) {
    throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  }
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.FIELD_ENCRYPTION_KEY
  ) {
    throw new Error("EMAIL_PAYLOAD_ENCRYPTION_NOT_CONFIGURED");
  }
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.APP_PUBLIC_URL?.trim()
  ) {
    throw new Error("APP_PUBLIC_URL_NOT_CONFIGURED");
  }
}

function publicAppUrl(): string {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_PUBLIC_URL_NOT_CONFIGURED");
  }
  return "http://localhost:5173";
}

export function hashAuthToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function buildAuthLink(purpose: AuthEmailPurpose, rawToken: string): string {
  const path = purpose === "verify_email" ? "/verify-email" : "/reset-password";
  // A fragment is not sent to Railway or other HTTP servers. The frontend
  // reads it and submits the token in a protected POST request.
  return `${publicAppUrl()}${path}#token=${encodeURIComponent(rawToken)}`;
}

export function prepareAuthEmail(
  user: Pick<User, "id" | "email" | "name">,
  purpose: AuthEmailPurpose,
): PreparedAuthEmail {
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.FIELD_ENCRYPTION_KEY
  ) {
    throw new Error("EMAIL_PAYLOAD_ENCRYPTION_NOT_CONFIGURED");
  }

  const now = new Date();
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const template = TEMPLATE_BY_PURPOSE[purpose];
  const payload: AuthEmailPayload = {
    name: user.name,
    to: user.email,
    template,
    link: buildAuthLink(purpose, rawToken),
  };

  return {
    token: {
      id: tokenId,
      userId: user.id,
      purpose,
      tokenHash: hashAuthToken(rawToken),
      expiresAt: new Date(now.getTime() + TOKEN_TTLS[purpose]),
      createdAt: now,
    },
    outbox: {
      id: outboxId,
      userId: user.id,
      authTokenId: tokenId,
      recipient: user.email,
      template,
      payloadEncrypted: encrypt(JSON.stringify(payload)),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function queueAuthEmail(
  user: Pick<User, "id" | "email" | "name">,
  purpose: AuthEmailPurpose,
): Promise<{ outboxId: string }> {
  const prepared = prepareAuthEmail(user, purpose);
  const now = new Date();
  const template = TEMPLATE_BY_PURPOSE[purpose];

  await db.transaction(async (tx) => {
    await tx
      .update(emailOutboxTable)
      .set({
        status: "cancelled",
        updatedAt: now,
      })
      .where(
        and(
          eq(emailOutboxTable.userId, user.id),
          eq(emailOutboxTable.template, template),
          inArray(emailOutboxTable.status, ["pending", "processing"]),
        ),
      );
    await tx
      .update(authTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokensTable.userId, user.id),
          eq(authTokensTable.purpose, purpose),
          isNull(authTokensTable.usedAt),
        ),
      );
    await tx.insert(authTokensTable).values(prepared.token);
    await tx.insert(emailOutboxTable).values(prepared.outbox);
  });

  return { outboxId: prepared.outbox.id! };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

function renderEmail(payload: AuthEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const name = escapeHtml(payload.name);
  const link = escapeHtml(payload.link);
  const verification = payload.template === "email_verification";
  const title = verification ? "Confirme seu e-mail" : "Redefina sua senha";
  const intro = verification
    ? "Confirme que este endereço de e-mail pertence a você para continuar o cadastro na Lumen."
    : "Recebemos uma solicitação para redefinir a senha da sua conta na Lumen.";
  const action = verification ? "Confirmar e-mail" : "Redefinir senha";
  const expiration = verification
    ? "Este link é válido por 24 horas."
    : "Este link é válido por 30 minutos.";
  const ignored = verification
    ? "Se você não criou esta conta, ignore esta mensagem."
    : "Se você não solicitou a redefinição, ignore esta mensagem; sua senha continuará a mesma.";

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f6f7f8;font-family:Arial,sans-serif;color:#101112">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f6f7f8">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
          <tr><td style="font-size:24px;font-weight:700;padding-bottom:24px">LUMEN</td></tr>
          <tr><td><h1 style="font-size:24px;margin:0 0 16px">${title}</h1></td></tr>
          <tr><td style="font-size:16px;line-height:1.6"><p>Olá, ${name}.</p><p>${intro}</p></td></tr>
          <tr><td style="padding:20px 0">
            <a href="${link}" style="display:inline-block;background:#06b6d4;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">${action}</a>
          </td></tr>
          <tr><td style="font-size:14px;line-height:1.6;color:#5f6368"><p>${expiration}</p><p>${ignored}</p></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    subject: `${title} — Lumen`,
    html,
    text: `Olá, ${payload.name}.\n\n${intro}\n\n${action}: ${payload.link}\n\n${expiration}\n${ignored}`,
  };
}

class ResendRequestError extends Error {
  constructor(readonly status: number) {
    super(`Resend request failed with status ${status}`);
    this.name = "ResendRequestError";
  }
}

async function sendWithResend(
  payload: AuthEmailPayload,
  outboxId: string,
): Promise<string> {
  assertEmailDeliveryConfigured();
  const rendered = renderEmail(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `lumen/${outboxId}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: [payload.to],
        ...(process.env.EMAIL_REPLY_TO?.trim()
          ? { reply_to: process.env.EMAIL_REPLY_TO.trim() }
          : {}),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new ResendRequestError(response.status);
    const data = (await response.json()) as { id?: unknown };
    if (typeof data.id !== "string" || !data.id) {
      throw new Error("Resend response did not include a message id");
    }
    return data.id;
  } finally {
    clearTimeout(timeout);
  }
}

function safeFailureLabel(error: unknown): string {
  if (error instanceof ResendRequestError)
    return `provider_http_${error.status}`;
  if (error instanceof Error && error.name === "AbortError")
    return "provider_timeout";
  if (
    error instanceof Error &&
    error.message === "EMAIL_DELIVERY_NOT_CONFIGURED"
  )
    return "provider_not_configured";
  return "provider_request_failed";
}

export async function dispatchEmailOutboxItem(
  outboxId: string,
): Promise<boolean> {
  if (!isEmailDeliveryConfigured()) return false;

  const [item] = await db
    .update(emailOutboxTable)
    .set({
      status: "processing",
      attempts: sql`${emailOutboxTable.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutboxTable.id, outboxId),
        eq(emailOutboxTable.status, "pending"),
        lte(emailOutboxTable.nextAttemptAt, new Date()),
      ),
    )
    .returning();
  if (!item) return false;

  const [token] = await db
    .select()
    .from(authTokensTable)
    .where(eq(authTokensTable.id, item.authTokenId))
    .limit(1);
  if (!token || token.usedAt || token.expiresAt <= new Date()) {
    await db
      .update(emailOutboxTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(emailOutboxTable.id, item.id));
    return false;
  }

  try {
    const payload = JSON.parse(
      decrypt(item.payloadEncrypted),
    ) as AuthEmailPayload;
    if (!payload.to || !payload.link || !payload.template)
      throw new Error("Invalid email payload");
    const providerMessageId = await sendWithResend(payload, item.id);
    await db
      .update(emailOutboxTable)
      .set({
        status: "sent",
        providerMessageId,
        lastError: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailOutboxTable.id, item.id));
    logger.info(
      { outboxId: item.id, template: item.template },
      "Transactional email sent",
    );
    return true;
  } catch (error) {
    const terminal = item.attempts >= MAX_ATTEMPTS;
    const retryDelay =
      RETRY_DELAYS_MS[Math.min(item.attempts - 1, RETRY_DELAYS_MS.length - 1)];
    await db
      .update(emailOutboxTable)
      .set({
        status: terminal ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + retryDelay),
        lastError: safeFailureLabel(error),
        updatedAt: new Date(),
      })
      .where(eq(emailOutboxTable.id, item.id));
    logger.warn(
      {
        outboxId: item.id,
        template: item.template,
        attempt: item.attempts,
        terminal,
        failure: safeFailureLabel(error),
      },
      "Transactional email delivery failed",
    );
    return false;
  }
}

export async function processPendingEmails(limit = 10): Promise<number> {
  if (!isEmailDeliveryConfigured()) return 0;
  const items = await db
    .select({ id: emailOutboxTable.id })
    .from(emailOutboxTable)
    .where(
      and(
        eq(emailOutboxTable.status, "pending"),
        lte(emailOutboxTable.nextAttemptAt, new Date()),
      ),
    )
    .orderBy(asc(emailOutboxTable.nextAttemptAt))
    .limit(limit);

  let sent = 0;
  for (const item of items) {
    if (await dispatchEmailOutboxItem(item.id)) sent += 1;
  }
  return sent;
}

async function purgeExpiredAuthEmailData(): Promise<void> {
  // email_outbox rows are removed by the token foreign key cascade.
  await db.delete(authTokensTable).where(
    lt(authTokensTable.expiresAt, new Date(Date.now() - RETENTION_MS)),
  );
}

export function startEmailOutboxProcessor(): void {
  if (!isEmailDeliveryConfigured()) {
    logger.warn(
      "Transactional email delivery is not configured; queued messages will remain pending",
    );
    return;
  }

  // A crashed process may leave an item claimed. Resend idempotency protects
  // against duplicate delivery when it is safely retried.
  void db
    .update(emailOutboxTable)
    .set({
      status: "pending",
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutboxTable.status, "processing"),
        lt(emailOutboxTable.updatedAt, new Date(Date.now() - 5 * 60_000)),
      ),
    )
    .then(async () => {
      await purgeExpiredAuthEmailData();
      await processPendingEmails();
    })
    .catch((error) => {
      logger.error(
        { error },
        "Failed to initialize transactional email processor",
      );
    });

  const timer = setInterval(() => {
    void processPendingEmails().catch((error) => {
      logger.error({ error }, "Failed to process transactional email queue");
    });
  }, PROCESS_INTERVAL_MS);
  timer.unref();

  const cleanupTimer = setInterval(() => {
    void purgeExpiredAuthEmailData().catch(error => {
      logger.error({ error }, "Failed to remove expired authentication email data");
    });
  }, 24 * 60 * 60 * 1000);
  cleanupTimer.unref();
}

export async function recentlyIssuedAuthToken(
  userId: string,
  purpose: AuthEmailPurpose,
  withinMs = 60_000,
): Promise<boolean> {
  const [recent] = await db
    .select({ id: authTokensTable.id })
    .from(authTokensTable)
    .where(
      and(
        eq(authTokensTable.userId, userId),
        eq(authTokensTable.purpose, purpose),
        isNull(authTokensTable.usedAt),
        gt(authTokensTable.expiresAt, new Date()),
        gt(authTokensTable.createdAt, new Date(Date.now() - withinMs)),
      ),
    )
    .limit(1);
  return Boolean(recent);
}

export async function cancelPendingAuthEmails(
  userId: string,
  purpose: AuthEmailPurpose,
): Promise<void> {
  await db
    .update(emailOutboxTable)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutboxTable.userId, userId),
        eq(emailOutboxTable.template, TEMPLATE_BY_PURPOSE[purpose]),
        inArray(emailOutboxTable.status, ["pending", "processing"]),
      ),
    );
}
