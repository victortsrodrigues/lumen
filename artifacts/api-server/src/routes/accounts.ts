import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, membersTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { validateCsrfToken } from "../lib/csrf.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";

const router: IRouter = Router();

type AccountStatus = "pending" | "active" | "blocked" | "revoked" | "deleting";

function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function requireValidCsrf(req: Request, res: Response): boolean {
  if (!req.body?.csrfToken || !validateCsrfToken(req.body.csrfToken)) {
    res.status(400).json({ error: "CSRF_ERROR", message: "Token CSRF inválido" });
    return false;
  }
  return true;
}

async function getAccount(id: string) {
  const [account] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return account;
}

async function ensureAdminCanDeactivate(targetId: string, actorId: string, res: Response): Promise<boolean> {
  if (targetId === actorId) {
    res.status(409).json({
      error: "SELF_ACCESS_CHANGE",
      message: "Você não pode bloquear ou revogar a própria conta",
    });
    return false;
  }

  const target = await getAccount(targetId);
  if (!target) {
    res.status(404).json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return false;
  }

  if (target.role === "admin" && target.status === "active") {
    const [{ total }] = await db.select({ total: count() }).from(usersTable)
      .where(and(eq(usersTable.role, "admin"), eq(usersTable.status, "active")));
    if (Number(total) <= 1) {
      res.status(409).json({
        error: "LAST_ACTIVE_ADMIN",
        message: "O último administrador ativo não pode perder o acesso",
      });
      return false;
    }
  }

  return true;
}

function publicAccount(account: typeof usersTable.$inferSelect, memberName?: string | null) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    status: account.status,
    emailVerifiedAt: account.emailVerifiedAt,
    memberId: account.memberId,
    memberName: memberName ?? null,
    statusReason: account.statusReason,
    requestedAt: account.requestedAt,
    approvedAt: account.approvedAt,
    lastLoginAt: account.lastLoginAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

router.use(requireAuth, requireRole("admin"));

// GET /admin/accounts
router.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const offset = (page - 1) * limit;
  const status = req.query.status as AccountStatus | undefined;
  const role = req.query.role as "admin" | "leader" | "member" | undefined;
  const search = String(req.query.search ?? "").trim();

  const conditions = [];
  if (status && ["pending", "active", "blocked", "revoked", "deleting"].includes(status)) {
    conditions.push(eq(usersTable.status, status));
  }
  if (role && ["admin", "leader", "member"].includes(role)) {
    conditions.push(eq(usersTable.role, role));
  }
  if (search) {
    conditions.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }], statusRows] = await Promise.all([
    db.select({ account: usersTable, memberName: membersTable.fullName })
      .from(usersTable)
      .leftJoin(membersTable, eq(usersTable.memberId, membersTable.id))
      .where(where)
      .orderBy(
        sql`case when ${usersTable.status} = 'pending' then 0 else 1 end`,
        desc(usersTable.requestedAt),
        asc(usersTable.name),
      )
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(usersTable).where(where),
    db.select({ status: usersTable.status, total: count() })
      .from(usersTable)
      .groupBy(usersTable.status),
  ]);

  const summary = { pending: 0, active: 0, blocked: 0, revoked: 0, deleting: 0 };
  for (const row of statusRows) summary[row.status] = Number(row.total);

  res.json({
    accounts: rows.map(({ account, memberName }) => publicAccount(account, memberName)),
    summary,
    total: Number(total),
    page,
    limit,
  });
});

// GET /admin/accounts/:id
router.get("/:id", async (req: Request, res: Response) => {
  const accountId = String(req.params.id);
  const [row] = await db.select({ account: usersTable, memberName: membersTable.fullName })
    .from(usersTable)
    .leftJoin(membersTable, eq(usersTable.memberId, membersTable.id))
    .where(eq(usersTable.id, accountId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  res.json(publicAccount(row.account, row.memberName));
});

// POST /admin/accounts/:id/approve
router.post("/:id/approve", async (req: Request, res: Response) => {
  if (!requireValidCsrf(req, res)) return;
  const account = await getAccount(String(req.params.id));
  if (!account) {
    res.status(404).json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  if (account.status !== "pending") {
    res.status(409).json({ error: "INVALID_STATUS", message: "Somente contas pendentes podem ser aprovadas" });
    return;
  }

  let memberId = typeof req.body.memberId === "string" && req.body.memberId ? req.body.memberId : null;
  if (!memberId) {
    const matchingMembers = await db.select({ id: membersTable.id }).from(membersTable)
      .where(ilike(membersTable.email, account.email)).limit(2);
    if (matchingMembers.length === 1) memberId = matchingMembers[0].id;
  }

  if (memberId) {
    const [[member], [linkedAccount]] = await Promise.all([
      db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, memberId)).limit(1),
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.memberId, memberId)).limit(1),
    ]);
    if (!member) {
      res.status(400).json({ error: "INVALID_MEMBER", message: "Membro selecionado não existe" });
      return;
    }
    if (linkedAccount && linkedAccount.id !== account.id) {
      res.status(409).json({ error: "MEMBER_ALREADY_LINKED", message: "Este membro já está vinculado a outra conta" });
      return;
    }
  }

  const [updated] = await db.update(usersTable).set({
    status: "active",
    memberId,
    approvedAt: new Date(),
    approvedByUserId: req.user!.userId,
    statusReason: null,
    statusChangedAt: new Date(),
    statusChangedByUserId: req.user!.userId,
    sessionVersion: account.sessionVersion + 1,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, account.id)).returning();

  await createAuditLog({
    userId: req.user!.userId,
    action: "ACCOUNT_APPROVED",
    resourceType: "user",
    resourceId: account.id,
    details: { memberId },
    ipAddress: getIp(req),
  });
  await createNotification({
    userId: account.id,
    type: "account.approved",
    title: "Acesso aprovado",
    message: account.emailVerifiedAt
      ? "Sua conta foi aprovada. Você já pode acessar a plataforma."
      : "Sua conta foi aprovada. Confirme seu e-mail para acessar a plataforma.",
    link: "/",
    entityType: "user",
    entityId: account.id,
  });

  res.json(publicAccount(updated));
});

async function changeStatus(
  req: Request,
  res: Response,
  expected: AccountStatus[],
  nextStatus: AccountStatus,
  action: string,
  requireReason = false,
) {
  if (!requireValidCsrf(req, res)) return;
  const account = await getAccount(String(req.params.id));
  if (!account) {
    res.status(404).json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  if (!expected.includes(account.status)) {
    res.status(409).json({ error: "INVALID_STATUS", message: "A conta não está em um estado compatível com esta ação" });
    return;
  }
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (requireReason && !reason) {
    res.status(400).json({ error: "REASON_REQUIRED", message: "Informe o motivo desta ação" });
    return;
  }
  if (["blocked", "revoked"].includes(nextStatus)) {
    if (!(await ensureAdminCanDeactivate(account.id, req.user!.userId, res))) return;
  }

  const [updated] = await db.update(usersTable).set({
    status: nextStatus,
    statusReason: reason || null,
    statusChangedAt: new Date(),
    statusChangedByUserId: req.user!.userId,
    sessionVersion: account.sessionVersion + 1,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, account.id)).returning();

  await createAuditLog({
    userId: req.user!.userId,
    action,
    resourceType: "user",
    resourceId: account.id,
    details: { fromStatus: account.status, toStatus: nextStatus, reason: reason || null },
    ipAddress: getIp(req),
  });

  res.json(publicAccount(updated));
}

router.post("/:id/block", (req, res) => changeStatus(req, res, ["active"], "blocked", "ACCOUNT_BLOCKED", true));
router.post("/:id/unblock", (req, res) => changeStatus(req, res, ["blocked"], "active", "ACCOUNT_UNBLOCKED"));
router.post("/:id/revoke", (req, res) => changeStatus(req, res, ["active", "blocked"], "revoked", "ACCOUNT_REVOKED", true));
router.post("/:id/reactivate", (req, res) => changeStatus(req, res, ["revoked"], "active", "ACCOUNT_REACTIVATED"));

// PATCH /admin/accounts/:id/role — deliberately excludes admin promotion.
router.patch("/:id/role", async (req: Request, res: Response) => {
  if (!requireValidCsrf(req, res)) return;
  const role = req.body.role as "member" | "leader";
  if (!["member", "leader"].includes(role)) {
    res.status(400).json({ error: "INVALID_ROLE", message: "O papel deve ser membro ou líder" });
    return;
  }
  const account = await getAccount(String(req.params.id));
  if (!account) {
    res.status(404).json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  if (account.role === "admin") {
    res.status(409).json({ error: "ADMIN_ROLE_PROTECTED", message: "O papel de administrador não pode ser alterado nesta tela" });
    return;
  }
  if (account.status !== "active") {
    res.status(409).json({ error: "ACCOUNT_INACTIVE", message: "Ative a conta antes de alterar o papel" });
    return;
  }

  const [updated] = await db.update(usersTable).set({
    role,
    sessionVersion: account.sessionVersion + 1,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, account.id)).returning();

  await createAuditLog({
    userId: req.user!.userId,
    action: "ACCOUNT_ROLE_CHANGED",
    resourceType: "user",
    resourceId: account.id,
    details: { fromRole: account.role, toRole: role },
    ipAddress: getIp(req),
  });

  res.json(publicAccount(updated));
});

// PATCH /admin/accounts/:id/member-link
router.patch("/:id/member-link", async (req: Request, res: Response) => {
  if (!requireValidCsrf(req, res)) return;
  const account = await getAccount(String(req.params.id));
  if (!account) {
    res.status(404).json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  const memberId = typeof req.body.memberId === "string" && req.body.memberId ? req.body.memberId : null;
  if (memberId) {
    const [[member], [linkedAccount]] = await Promise.all([
      db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, memberId)).limit(1),
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.memberId, memberId)).limit(1),
    ]);
    if (!member) {
      res.status(400).json({ error: "INVALID_MEMBER", message: "Membro selecionado não existe" });
      return;
    }
    if (linkedAccount && linkedAccount.id !== account.id) {
      res.status(409).json({ error: "MEMBER_ALREADY_LINKED", message: "Este membro já está vinculado a outra conta" });
      return;
    }
  }

  const [updated] = await db.update(usersTable).set({ memberId, updatedAt: new Date() })
    .where(eq(usersTable.id, account.id)).returning();
  await createAuditLog({
    userId: req.user!.userId,
    action: "ACCOUNT_MEMBER_LINK_CHANGED",
    resourceType: "user",
    resourceId: account.id,
    details: { fromMemberId: account.memberId, toMemberId: memberId },
    ipAddress: getIp(req),
  });
  res.json(publicAccount(updated));
});

export default router;
