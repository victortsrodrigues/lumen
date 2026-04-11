import { Router, type IRouter, Request, Response } from "express";
import { db, institutionalPagesTable } from "@workspace/db";
import { eq, and, isNull, count, desc, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

const VALID_SECTIONS = ["sobre", "valores", "horarios", "contato", "pastoral", "historia"];

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + crypto.randomUUID().slice(0, 4);
}

function serializePage(p: typeof institutionalPagesTable.$inferSelect) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    body: p.body,
    section: p.section,
    isPublished: p.isPublished,
    sortOrder: p.sortOrder,
    coverImageUrl: p.coverImageUrl,
    createdAt: p.createdAt?.toISOString(),
    updatedAt: p.updatedAt?.toISOString(),
  };
}

// ─── PUBLIC (no auth) ───────────────────────────────────────────────────────

// GET /institutional/public — list published pages
router.get("/public", async (req: Request, res: Response) => {
  const section = req.query.section as string | undefined;

  const conditions = [
    isNull(institutionalPagesTable.deletedAt),
    eq(institutionalPagesTable.isPublished, true),
  ];
  if (section && VALID_SECTIONS.includes(section)) {
    conditions.push(eq(institutionalPagesTable.section, section as any));
  }

  const where = and(...conditions);

  const pages = await db.select().from(institutionalPagesTable)
    .where(where)
    .orderBy(asc(institutionalPagesTable.sortOrder));

  res.json({ pages: pages.map(serializePage) });
});

// GET /institutional/public/:slug — single published page by slug
router.get("/public/:slug", async (req: Request, res: Response) => {
  const { slug } = req.params;

  const [page] = await db.select().from(institutionalPagesTable)
    .where(and(
      eq(institutionalPagesTable.slug, slug),
      eq(institutionalPagesTable.isPublished, true),
      isNull(institutionalPagesTable.deletedAt),
    ));

  if (!page) {
    res.status(404).json({ error: "Pagina nao encontrada" });
    return;
  }

  res.json(serializePage(page));
});

// ─── ADMIN ──────────────────────────────────────────────────────────────────

// GET /institutional — all pages (including drafts)
router.get("/", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const section = req.query.section as string | undefined;

  const conditions = [isNull(institutionalPagesTable.deletedAt)];
  if (section && VALID_SECTIONS.includes(section)) {
    conditions.push(eq(institutionalPagesTable.section, section as any));
  }

  const where = and(...conditions);

  const [pages, [{ total }]] = await Promise.all([
    db.select().from(institutionalPagesTable).where(where)
      .orderBy(asc(institutionalPagesTable.sortOrder))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(institutionalPagesTable).where(where),
  ]);

  res.json({ pages: pages.map(serializePage), total: Number(total), page, limit });
});

// POST /institutional
router.post("/", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { title, body, section, isPublished, sortOrder, coverImageUrl } = req.body;
  const user = req.user!;

  if (!title?.trim()) {
    res.status(400).json({ error: "Titulo e obrigatorio" });
    return;
  }
  if (!body?.trim()) {
    res.status(400).json({ error: "Corpo da pagina e obrigatorio" });
    return;
  }
  if (!section || !VALID_SECTIONS.includes(section)) {
    res.status(400).json({ error: `Secao invalida. Valores: ${VALID_SECTIONS.join(", ")}` });
    return;
  }

  const slug = slugify(title);

  const [page] = await db.insert(institutionalPagesTable).values({
    title: title.trim(),
    slug,
    body: body.trim(),
    section: section as any,
    isPublished: isPublished ?? false,
    sortOrder: sortOrder ?? 0,
    coverImageUrl: coverImageUrl || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "INSTITUTIONAL_PAGE_CREATED",
    resourceType: "institutional_page",
    resourceId: page.id,
    details: { title: page.title, section, slug },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializePage(page));
});

// PUT /institutional/:id
router.put("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(institutionalPagesTable)
    .where(and(eq(institutionalPagesTable.id, id), isNull(institutionalPagesTable.deletedAt)));
  if (!existing) {
    res.status(404).json({ error: "Pagina nao encontrada" });
    return;
  }

  const { title, body, section, isPublished, sortOrder, coverImageUrl } = req.body;
  const updates: Record<string, any> = { updatedByUserId: user.userId, updatedAt: new Date() };

  if (title !== undefined) updates.title = title.trim();
  if (body !== undefined) updates.body = body.trim();
  if (section !== undefined) {
    if (!VALID_SECTIONS.includes(section)) {
      res.status(400).json({ error: `Secao invalida. Valores: ${VALID_SECTIONS.join(", ")}` });
      return;
    }
    updates.section = section;
  }
  if (isPublished !== undefined) updates.isPublished = isPublished;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl || null;

  const [updated] = await db.update(institutionalPagesTable).set(updates)
    .where(eq(institutionalPagesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "INSTITUTIONAL_PAGE_UPDATED",
    resourceType: "institutional_page",
    resourceId: id,
    details: { title: updated.title },
    ipAddress: getIp(req),
  });

  res.json(serializePage(updated));
});

// DELETE /institutional/:id (soft delete)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const [existing] = await db.select().from(institutionalPagesTable)
    .where(and(eq(institutionalPagesTable.id, id), isNull(institutionalPagesTable.deletedAt)));
  if (!existing) {
    res.status(404).json({ error: "Pagina nao encontrada" });
    return;
  }

  await db.update(institutionalPagesTable).set({
    deletedAt: new Date(), updatedByUserId: user.userId, updatedAt: new Date(),
  }).where(eq(institutionalPagesTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "INSTITUTIONAL_PAGE_DELETED",
    resourceType: "institutional_page",
    resourceId: id,
    details: { title: existing.title },
    ipAddress: getIp(req),
  });

  res.json({ message: "Pagina removida com sucesso" });
});

export default router;
