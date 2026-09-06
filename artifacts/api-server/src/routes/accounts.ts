import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  membersTable,
  usersTable,
  auditLogsTable,
  notificationsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { z } from "zod/v4";

const router: IRouter = Router();

type AccountStatus = typeof usersTable.$inferSelect.status;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
class AccountError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const memberLinkSchema = z
  .object({ memberId: z.string().trim().min(1).max(100).nullable() })
  .strict();
const approvalSchema = memberLinkSchema.partial();
const reasonSchema = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();

// A row lock serializes approve/reject/link changes. Auditing commits with them.
async function mutateAccount(
  req: Request,
  res: Response,
  operation: (
    tx: Transaction,
    account: typeof usersTable.$inferSelect,
  ) => Promise<void>,
) {
  try {
    const result = await db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, String(req.params.id)))
        .limit(1)
        .for("update");
      if (!account)
        throw new AccountError(404, "NOT_FOUND", "Conta não encontrada");
      await operation(tx, account);
      const [row] = await tx
        .select({ account: usersTable, memberName: membersTable.fullName })
        .from(usersTable)
        .leftJoin(membersTable, eq(usersTable.memberId, membersTable.id))
        .where(eq(usersTable.id, account.id));
      return publicAccount(row.account, row.memberName);
    });
    res.json(result);
  } catch (error) {
    if (error instanceof AccountError) {
      res
        .status(error.status)
        .json({ error: error.code, message: error.message });
      return;
    }
    // Drizzle wraps the PostgreSQL error as cause. Never expose SQL or values.
    const pgError =
      (error as { cause?: { code?: string } })?.cause ??
      (error as { code?: string });
    if (pgError?.code === "23505") {
      res
        .status(409)
        .json({
          error: "MEMBER_ALREADY_LINKED",
          message:
            "Este membro já está vinculado a outra conta. Atualize a lista.",
        });
      return;
    }
    if (pgError?.code === "23503") {
      res
        .status(409)
        .json({
          error: "INVALID_MEMBER",
          message:
            "O membro selecionado não está mais disponível. Atualize a lista.",
        });
      return;
    }
    req.log?.error("Account operation failed");
    res
      .status(500)
      .json({
        error: "ACCOUNT_OPERATION_FAILED",
        message: "Não foi possível concluir a alteração. Tente novamente.",
      });
  }
}

async function validateMemberLink(
  tx: Transaction,
  accountId: string,
  memberId: string | null,
) {
  if (!memberId) return;
  const [member] = await tx
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(eq(membersTable.id, memberId))
    .limit(1);
  if (!member)
    throw new AccountError(
      400,
      "INVALID_MEMBER",
      "Membro selecionado não existe",
    );
  const [linked] = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.memberId, memberId))
    .limit(1);
  if (linked && linked.id !== accountId) {
    throw new AccountError(
      409,
      "MEMBER_ALREADY_LINKED",
      "Este membro já está vinculado a outra conta",
    );
  }
}

async function auditChange(
  tx: Transaction,
  req: Request,
  accountId: string,
  action: string,
  details: Record<string, unknown>,
) {
  await tx
    .insert(auditLogsTable)
    .values({
      userId: req.user!.userId,
      resourceType: "user",
      resourceId: accountId,
      action,
      details,
      ipAddress: getIp(req),
    });
}

function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

async function getAccount(id: string) {
  const [account] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return account;
}

async function ensureAdminCanDeactivate(
  targetId: string,
  actorId: string,
  res: Response,
): Promise<boolean> {
  if (targetId === actorId) {
    res.status(409).json({
      error: "SELF_ACCESS_CHANGE",
      message: "Você não pode bloquear ou revogar a própria conta",
    });
    return false;
  }

  const target = await getAccount(targetId);
  if (!target) {
    res
      .status(404)
      .json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return false;
  }

  if (target.role === "admin" && target.status === "active") {
    const [{ total }] = await db
      .select({ total: count() })
      .from(usersTable)
      .where(
        and(eq(usersTable.role, "admin"), eq(usersTable.status, "active")),
      );
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

function publicAccount(
  account: typeof usersTable.$inferSelect,
  memberName?: string | null,
) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    status: account.status,
    emailVerifiedAt: account.emailVerifiedAt,
    memberId: account.memberId,
    memberLinkReviewedAt: account.memberLinkReviewedAt,
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
  const page = Math.max(
    1,
    Number.parseInt(String(req.query.page ?? "1"), 10) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20),
  );
  const offset = (page - 1) * limit;
  const status = req.query.status as AccountStatus | undefined;
  const role = req.query.role as "admin" | "leader" | "member" | undefined;
  const search = String(req.query.search ?? "").trim();

  const conditions = [];
  if (
    status &&
    [
      "pending",
      "rejected",
      "active",
      "blocked",
      "revoked",
      "deleting",
    ].includes(status)
  ) {
    conditions.push(eq(usersTable.status, status));
  }
  if (role && ["admin", "leader", "member"].includes(role)) {
    conditions.push(eq(usersTable.role, role));
  }
  if (search) {
    conditions.push(
      or(
        ilike(usersTable.name, `%${search}%`),
        ilike(usersTable.email, `%${search}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }], statusRows] = await Promise.all([
    db
      .select({ account: usersTable, memberName: membersTable.fullName })
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
    db
      .select({ status: usersTable.status, total: count() })
      .from(usersTable)
      .groupBy(usersTable.status),
  ]);

  const summary = {
    pending: 0,
    rejected: 0,
    active: 0,
    blocked: 0,
    revoked: 0,
    deleting: 0,
  };
  for (const row of statusRows) summary[row.status] = Number(row.total);

  res.json({
    accounts: rows.map(({ account, memberName }) =>
      publicAccount(account, memberName),
    ),
    summary,
    total: Number(total),
    page,
    limit,
  });
});

// Small admin-only projection: no CPF, address, or other member details.
router.get("/member-options", async (req: Request, res: Response) => {
  const page = Math.max(
    1,
    Number.parseInt(String(req.query.page ?? 1), 10) || 1,
  );
  const limit = 20;
  const search = String(req.query.search ?? "")
    .trim()
    .slice(0, 200);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = search
    ? or(
        ilike(membersTable.fullName, pattern),
        ilike(membersTable.email, pattern),
      )
    : undefined;
  const [members, [{ total }]] = await Promise.all([
    db
      .select({
        id: membersTable.id,
        name: membersTable.fullName,
        email: membersTable.email,
        status: membersTable.status,
        linkedAccountId: usersTable.id,
        linkedAccountName: usersTable.name,
      })
      .from(membersTable)
      .leftJoin(usersTable, eq(usersTable.memberId, membersTable.id))
      .where(where)
      .orderBy(asc(membersTable.fullName), asc(membersTable.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(membersTable).where(where),
  ]);
  res.json({ members, total: Number(total), page, limit });
});

// GET /admin/accounts/:id
router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const accountId = String(req.params.id);
  const [row] = await db
    .select({ account: usersTable, memberName: membersTable.fullName })
    .from(usersTable)
    .leftJoin(membersTable, eq(usersTable.memberId, membersTable.id))
    .where(eq(usersTable.id, accountId))
    .limit(1);
  if (!row) {
    res
      .status(404)
      .json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  res.json(publicAccount(row.account, row.memberName));
});

// POST /admin/accounts/:id/approve
router.post("/:id/approve", async (req: Request<{ id: string }>, res: Response) => {
  const parsed = approvalSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "VALIDATION_ERROR",
        message: "Selecione um membro válido ou a opção sem vínculo.",
      });
    return;
  }
  await mutateAccount(req, res, async (tx, account) => {
    if (account.status !== "pending")
      throw new AccountError(
        409,
        "INVALID_STATUS",
        "Somente contas pendentes podem ser aprovadas",
      );
    const explicit = Object.hasOwn(parsed.data, "memberId");
    let memberId = explicit ? parsed.data.memberId! : account.memberId;
    if (!explicit && !memberId && !account.memberLinkReviewedAt) {
      // Exact normalized equality, not ILIKE (email may contain SQL wildcards).
      const matches = await tx
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(
          sql`lower(trim(${membersTable.email})) = ${account.email.trim().toLowerCase()}`,
        )
        .limit(2);
      if (matches.length === 1) {
        const [occupied] = await tx
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.memberId, matches[0].id))
          .limit(1);
        if (!occupied) memberId = matches[0].id;
      }
    }
    await validateMemberLink(tx, account.id, memberId);
    const now = new Date();
    await tx
      .update(usersTable)
      .set({
        status: "active",
        memberId,
        memberLinkReviewedAt: explicit ? now : account.memberLinkReviewedAt,
        approvedAt: now,
        approvedByUserId: req.user!.userId,
        statusReason: null,
        statusChangedAt: now,
        statusChangedByUserId: req.user!.userId,
        sessionVersion: account.sessionVersion + 1,
        updatedAt: now,
      })
      .where(eq(usersTable.id, account.id));
    await auditChange(tx, req, account.id, "ACCOUNT_APPROVED", {
      fromMemberId: account.memberId,
      memberId,
    });
    await tx
      .insert(notificationsTable)
      .values({
        userId: account.id,
        type: "account.approved",
        title: "Acesso aprovado",
        message: "Sua conta foi aprovada pela administração.",
        link: "/",
        entityType: "user",
        entityId: account.id,
      });
  });
});

router.post("/:id/reject", async (req: Request<{ id: string }>, res: Response) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "REASON_REQUIRED",
        message: "Informe um motivo de até 1.000 caracteres.",
      });
    return;
  }
  await mutateAccount(req, res, async (tx, account) => {
    if (account.status !== "pending")
      throw new AccountError(
        409,
        "INVALID_STATUS",
        "Somente solicitações pendentes podem ser rejeitadas",
      );
    await tx
      .update(usersTable)
      .set({
        status: "rejected",
        statusReason: parsed.data.reason,
        statusChangedAt: new Date(),
        statusChangedByUserId: req.user!.userId,
        sessionVersion: account.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, account.id));
    await auditChange(tx, req, account.id, "ACCOUNT_REJECTED", {
      fromStatus: "pending",
      toStatus: "rejected",
      reason: parsed.data.reason,
    });
  });
});

router.post("/:id/reopen", async (req: Request<{ id: string }>, res: Response) => {
  await mutateAccount(req, res, async (tx, account) => {
    if (account.status !== "rejected")
      throw new AccountError(
        409,
        "INVALID_STATUS",
        "Somente solicitações rejeitadas podem ser reabertas",
      );
    await tx
      .update(usersTable)
      .set({
        status: "pending",
        statusReason: null,
        requestedAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedByUserId: req.user!.userId,
        sessionVersion: account.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, account.id));
    await auditChange(tx, req, account.id, "ACCOUNT_REOPENED", {
      fromStatus: "rejected",
      toStatus: "pending",
      previousReason: account.statusReason,
    });
  });
});

async function changeStatus(
  req: Request,
  res: Response,
  expected: AccountStatus[],
  nextStatus: AccountStatus,
  action: string,
  requireReason = false,
) {
  const account = await getAccount(String(req.params.id));
  if (!account) {
    res
      .status(404)
      .json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  if (!expected.includes(account.status)) {
    res
      .status(409)
      .json({
        error: "INVALID_STATUS",
        message: "A conta não está em um estado compatível com esta ação",
      });
    return;
  }
  const reason =
    typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (requireReason && !reason) {
    res
      .status(400)
      .json({
        error: "REASON_REQUIRED",
        message: "Informe o motivo desta ação",
      });
    return;
  }
  if (["blocked", "revoked"].includes(nextStatus)) {
    if (!(await ensureAdminCanDeactivate(account.id, req.user!.userId, res)))
      return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      status: nextStatus,
      statusReason: reason || null,
      statusChangedAt: new Date(),
      statusChangedByUserId: req.user!.userId,
      sessionVersion: sql`${usersTable.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, account.id))
    .returning();

  await createAuditLog({
    userId: req.user!.userId,
    action,
    resourceType: "user",
    resourceId: account.id,
    details: {
      fromStatus: account.status,
      toStatus: nextStatus,
      reason: reason || null,
    },
    ipAddress: getIp(req),
  });

  res.json(publicAccount(updated));
}

router.post("/:id/block", (req, res) =>
  changeStatus(req, res, ["active"], "blocked", "ACCOUNT_BLOCKED", true),
);
router.post("/:id/unblock", (req, res) =>
  changeStatus(req, res, ["blocked"], "active", "ACCOUNT_UNBLOCKED"),
);
router.post("/:id/revoke", (req, res) =>
  changeStatus(
    req,
    res,
    ["active", "blocked"],
    "revoked",
    "ACCOUNT_REVOKED",
    true,
  ),
);
router.post("/:id/reactivate", (req, res) =>
  changeStatus(req, res, ["revoked"], "active", "ACCOUNT_REACTIVATED"),
);

// PATCH /admin/accounts/:id/role — deliberately excludes admin promotion.
router.patch("/:id/role", async (req: Request<{ id: string }>, res: Response) => {
  const role = req.body.role as "member" | "leader";
  if (!["member", "leader"].includes(role)) {
    res
      .status(400)
      .json({
        error: "INVALID_ROLE",
        message: "O papel deve ser membro ou líder",
      });
    return;
  }
  const account = await getAccount(String(req.params.id));
  if (!account) {
    res
      .status(404)
      .json({ error: "NOT_FOUND", message: "Conta não encontrada" });
    return;
  }
  if (account.role === "admin") {
    res
      .status(409)
      .json({
        error: "ADMIN_ROLE_PROTECTED",
        message: "O papel de administrador não pode ser alterado nesta tela",
      });
    return;
  }
  if (account.status !== "active") {
    res
      .status(409)
      .json({
        error: "ACCOUNT_INACTIVE",
        message: "Ative a conta antes de alterar o papel",
      });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      role,
      sessionVersion: sql`${usersTable.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, account.id))
    .returning();

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
router.patch("/:id/member-link", async (req: Request<{ id: string }>, res: Response) => {
  const parsed = memberLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "VALIDATION_ERROR",
        message: "Selecione um membro ou confirme a opção sem vínculo.",
      });
    return;
  }
  await mutateAccount(req, res, async (tx, account) => {
    if (account.status === "deleting")
      throw new AccountError(
        409,
        "INVALID_STATUS",
        "Não é possível alterar uma conta em exclusão",
      );
    const { memberId } = parsed.data;
    await validateMemberLink(tx, account.id, memberId);
    await tx
      .update(usersTable)
      .set({
        memberId,
        memberLinkReviewedAt: new Date(),
        sessionVersion: account.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, account.id));
    await auditChange(tx, req, account.id, "ACCOUNT_MEMBER_LINK_CHANGED", {
      fromMemberId: account.memberId,
      toMemberId: memberId,
    });
  });
});

export default router;
