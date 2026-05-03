import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  eventsTable,
  eventRegistrationsTable,
  eventAttendanceTable,
  eventSchedulesTable,
  serviceRolesTable,
  membersTable,
} from "@workspace/db";
import { eq, desc, and, isNull, gte, lte, count, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { notifyAllUsers, notifyMember } from "../lib/notifications.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function serializeEvent(e: typeof eventsTable.$inferSelect) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    startDate: e.startDate?.toISOString(),
    endDate: e.endDate?.toISOString(),
    location: e.location,
    responsibleId: e.responsibleId,
    responsibleName: e.responsibleName,
    recurrence: e.recurrence,
    type: e.type,
    maxSlots: e.maxSlots,
    status: e.status,
    createdAt: e.createdAt?.toISOString(),
    updatedAt: e.updatedAt?.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /events
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions = [isNull(eventsTable.deletedAt)];
  if (type) conditions.push(eq(eventsTable.type, type as "culto"));
  if (status) conditions.push(eq(eventsTable.status, status as "agendado"));
  if (dateFrom) conditions.push(gte(eventsTable.startDate, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(eventsTable.startDate, new Date(dateTo)));

  const where = and(...conditions);

  const [events, [{ total }]] = await Promise.all([
    db.select().from(eventsTable).where(where)
      .orderBy(asc(eventsTable.startDate))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(eventsTable).where(where),
  ]);

  // Get registration counts
  const eventIds = events.map(e => e.id);
  const regCounts = eventIds.length > 0
    ? await Promise.all(eventIds.map(async (eid) => {
        const [{ total: regTotal }] = await db.select({ total: count() })
          .from(eventRegistrationsTable)
          .where(eq(eventRegistrationsTable.eventId, eid));
        return { eventId: eid, count: Number(regTotal) };
      }))
    : [];

  const countMap = new Map(regCounts.map(r => [r.eventId, r.count]));

  res.json({
    events: events.map(e => ({
      ...serializeEvent(e),
      registeredCount: countMap.get(e.id) || 0,
    })),
    total: Number(total),
    page,
    limit,
  });
});

// GET /events/upcoming — próximos N dias (default 7, max 365 com clamp silencioso)
router.get("/upcoming", requireAuth, async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 7));
  const now = new Date();
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const events = await db.select().from(eventsTable)
    .where(and(
      isNull(eventsTable.deletedAt),
      gte(eventsTable.startDate, now),
      lte(eventsTable.startDate, until),
    ))
    .orderBy(asc(eventsTable.startDate))
    .limit(50);

  res.json({ events: events.map(serializeEvent) });
});

// GET /events/calendar?year=2026 — eventos do ano agrupados por mês
router.get("/calendar", requireAuth, async (req: Request, res: Response) => {
  const year = req.query.year as string || String(new Date().getFullYear());
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const events = await db.select().from(eventsTable)
    .where(and(
      isNull(eventsTable.deletedAt),
      gte(eventsTable.startDate, new Date(yearStart)),
      lte(eventsTable.startDate, new Date(yearEnd + "T23:59:59Z")),
    ))
    .orderBy(asc(eventsTable.startDate));

  const MONTH_LABELS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = String(m).padStart(2, "0");
    const monthEvents = events.filter(e => {
      const d = e.startDate;
      return d && d.getMonth() + 1 === m;
    });
    months.push({
      month: monthStr,
      label: MONTH_LABELS[m],
      events: monthEvents.map(serializeEvent),
    });
  }

  res.json({
    year,
    months,
    totalEvents: events.length,
  });
});

// GET /events/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const [event] = await db.select().from(eventsTable)
    .where(and(eq(eventsTable.id, req.params.id), isNull(eventsTable.deletedAt)))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "NOT_FOUND", message: "Evento não encontrado" });
    return;
  }

  const registrations = await db.select().from(eventRegistrationsTable)
    .where(eq(eventRegistrationsTable.eventId, event.id))
    .orderBy(asc(eventRegistrationsTable.registeredAt));

  res.json({
    ...serializeEvent(event),
    registrations: registrations.map(r => ({
      id: r.id,
      memberId: r.memberId,
      memberName: r.memberName,
      registeredAt: r.registeredAt?.toISOString(),
    })),
  });
});

// POST /events
router.post("/", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { title, description, startDate, endDate, location, responsibleId, recurrence, type, maxSlots, status } = req.body;

  if (!title || !startDate || !endDate || !type) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: título, data início, data fim, tipo" });
    return;
  }

  let responsibleName: string | null = null;
  if (responsibleId) {
    const [member] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, responsibleId)).limit(1);
    responsibleName = member?.fullName ?? null;
  }

  const [event] = await db.insert(eventsTable).values({
    title,
    description: description ?? null,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    location: location ?? null,
    responsibleId: responsibleId ?? null,
    responsibleName,
    recurrence: (recurrence ?? "unico") as "unico",
    type: type as "culto",
    maxSlots: maxSlots ?? null,
    status: (status ?? "agendado") as "agendado",
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "EVENT_CREATED",
    resourceType: "event",
    resourceId: event.id,
    details: { title, type },
    ipAddress: ip,
  });

  const eventDate = event.startDate?.toLocaleDateString("pt-BR") ?? "";
  await notifyAllUsers({
    type: "event.created",
    title: "Novo evento",
    message: `"${event.title}" — ${eventDate}`,
    link: `/events/${event.id}`,
    entityType: "event",
    entityId: event.id,
  });

  res.status(201).json(serializeEvent(event));
});

// PUT /events/:id
router.put("/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(eventsTable)
    .where(and(eq(eventsTable.id, req.params.id), isNull(eventsTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Evento não encontrado" });
    return;
  }

  const { title, description, startDate, endDate, location, responsibleId, recurrence, type, maxSlots, status } = req.body;

  let responsibleName = existing.responsibleName;
  if (responsibleId && responsibleId !== existing.responsibleId) {
    const [member] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, responsibleId)).limit(1);
    responsibleName = member?.fullName ?? null;
  }

  const [updated] = await db.update(eventsTable).set({
    title: title ?? existing.title,
    description: description !== undefined ? description : existing.description,
    startDate: startDate ? new Date(startDate) : existing.startDate,
    endDate: endDate ? new Date(endDate) : existing.endDate,
    location: location !== undefined ? location : existing.location,
    responsibleId: responsibleId !== undefined ? responsibleId : existing.responsibleId,
    responsibleName,
    recurrence: recurrence ?? existing.recurrence,
    type: type ?? existing.type,
    maxSlots: maxSlots !== undefined ? maxSlots : existing.maxSlots,
    status: status ?? existing.status,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(eventsTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "EVENT_UPDATED",
    resourceType: "event",
    resourceId: updated.id,
    details: { title: updated.title },
    ipAddress: ip,
  });

  const eventDate = updated.startDate?.toLocaleDateString("pt-BR") ?? "";
  await notifyAllUsers({
    type: "event.updated",
    title: "Evento atualizado",
    message: `"${updated.title}" — ${eventDate}`,
    link: `/events/${updated.id}`,
    entityType: "event",
    entityId: updated.id,
  });

  res.json(serializeEvent(updated));
});

// DELETE /events/:id (soft delete)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(eventsTable)
    .where(and(eq(eventsTable.id, req.params.id), isNull(eventsTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Evento não encontrado" });
    return;
  }

  await db.update(eventsTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(eventsTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "EVENT_DELETED",
    resourceType: "event",
    resourceId: existing.id,
    details: { title: existing.title },
    ipAddress: ip,
  });

  await notifyAllUsers({
    type: "event.deleted",
    title: "Evento cancelado",
    message: `"${existing.title}" foi cancelado.`,
    link: `/events`,
    entityType: "event",
    entityId: existing.id,
  });

  res.json({ message: "Evento excluído com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /events/:id/registrations
router.get("/:id/registrations", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const registrations = await db.select().from(eventRegistrationsTable)
    .where(eq(eventRegistrationsTable.eventId, req.params.id))
    .orderBy(asc(eventRegistrationsTable.registeredAt));

  res.json({ registrations });
});

// POST /events/:id/register
router.post("/:id/register", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [event] = await db.select().from(eventsTable)
    .where(and(eq(eventsTable.id, req.params.id), isNull(eventsTable.deletedAt)))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "NOT_FOUND", message: "Evento não encontrado" });
    return;
  }

  // Self-register or admin-register
  let memberId = req.body.memberId;
  if (role === "member") {
    const [member] = await db.select({ id: membersTable.id, fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.email, req.user!.email)).limit(1);
    if (!member) {
      res.status(404).json({ error: "NOT_FOUND", message: "Membro não encontrado para este usuário" });
      return;
    }
    memberId = member.id;
  }

  if (!memberId) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "memberId é obrigatório" });
    return;
  }

  // Check if already registered
  const [existing] = await db.select().from(eventRegistrationsTable)
    .where(and(
      eq(eventRegistrationsTable.eventId, event.id),
      eq(eventRegistrationsTable.memberId, memberId),
    )).limit(1);

  if (existing) {
    res.status(409).json({ error: "ALREADY_REGISTERED", message: "Membro já inscrito neste evento" });
    return;
  }

  // Check max slots
  if (event.maxSlots) {
    const [{ total }] = await db.select({ total: count() }).from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.eventId, event.id));
    if (Number(total) >= event.maxSlots) {
      res.status(409).json({ error: "EVENT_FULL", message: "Evento atingiu o limite de vagas" });
      return;
    }
  }

  let memberName: string | null = null;
  const [member] = await db.select({ fullName: membersTable.fullName })
    .from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  memberName = member?.fullName ?? null;

  const [registration] = await db.insert(eventRegistrationsTable).values({
    eventId: event.id,
    memberId,
    memberName,
  }).returning();

  await createAuditLog({
    userId,
    action: "EVENT_REGISTRATION_CREATED",
    resourceType: "event_registration",
    resourceId: registration.id,
    details: { eventId: event.id, memberId },
    ipAddress: ip,
  });

  res.status(201).json(registration);
});

// DELETE /events/:id/register/:memberId
router.delete("/:id/register/:memberId", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [existing] = await db.select().from(eventRegistrationsTable)
    .where(and(
      eq(eventRegistrationsTable.eventId, req.params.id),
      eq(eventRegistrationsTable.memberId, req.params.memberId),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Inscrição não encontrada" });
    return;
  }

  // Members can only cancel their own registration
  if (role === "member") {
    const [member] = await db.select({ id: membersTable.id })
      .from(membersTable).where(eq(membersTable.email, req.user!.email)).limit(1);
    if (!member || member.id !== req.params.memberId) {
      res.status(403).json({ error: "FORBIDDEN", message: "Você só pode cancelar sua própria inscrição" });
      return;
    }
  }

  await db.delete(eventRegistrationsTable).where(eq(eventRegistrationsTable.id, existing.id));

  await createAuditLog({
    userId,
    action: "EVENT_REGISTRATION_DELETED",
    resourceType: "event_registration",
    resourceId: existing.id,
    details: { eventId: req.params.id, memberId: req.params.memberId },
    ipAddress: ip,
  });

  res.json({ message: "Inscrição cancelada com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /events/:id/attendance
router.get("/:id/attendance", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const records = await db.select().from(eventAttendanceTable)
    .where(eq(eventAttendanceTable.eventId, req.params.id));

  res.json({ attendance: records });
});

// POST /events/:id/attendance (batch)
router.post("/:id/attendance", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [event] = await db.select().from(eventsTable)
    .where(eq(eventsTable.id, req.params.id)).limit(1);

  if (!event) {
    res.status(404).json({ error: "NOT_FOUND", message: "Evento não encontrado" });
    return;
  }

  const { records } = req.body as { records: Array<{ memberId: string; present: boolean }> };
  if (!records || !Array.isArray(records)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "records é obrigatório (array de {memberId, present})" });
    return;
  }

  // Replace existing attendance
  await db.delete(eventAttendanceTable)
    .where(eq(eventAttendanceTable.eventId, event.id));

  if (records.length > 0) {
    await db.insert(eventAttendanceTable).values(
      records.map(r => ({
        eventId: event.id,
        memberId: r.memberId,
        present: r.present,
      }))
    );
  }

  await createAuditLog({
    userId,
    action: "EVENT_ATTENDANCE_RECORDED",
    resourceType: "event_attendance",
    resourceId: event.id,
    details: { totalRecords: records.length },
    ipAddress: ip,
  });

  res.json({ message: "Presença registrada com sucesso", total: records.length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT SCHEDULES (Escala de Voluntários)
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: check if logged-in user is the member in the schedule entry
async function isSelfMember(userEmail: string, memberId: string): Promise<boolean> {
  const [member] = await db.select().from(membersTable)
    .where(eq(membersTable.email, userEmail)).limit(1);
  return member?.id === memberId;
}

function serializeSchedule(s: typeof eventSchedulesTable.$inferSelect, roleName?: string) {
  return {
    id: s.id,
    eventId: s.eventId,
    serviceRoleId: s.serviceRoleId,
    serviceRoleName: roleName || null,
    memberId: s.memberId,
    memberName: s.memberName,
    status: s.status,
    notes: s.notes,
    createdAt: s.createdAt?.toISOString(),
    updatedAt: s.updatedAt?.toISOString(),
  };
}

// GET /events/:eventId/schedule
router.get("/:eventId/schedule", requireAuth, async (req: Request, res: Response) => {
  const { eventId } = req.params;

  const schedules = await db.select().from(eventSchedulesTable)
    .where(eq(eventSchedulesTable.eventId, eventId))
    .orderBy(eventSchedulesTable.createdAt);

  // Enrich with role names
  const enriched = await Promise.all(schedules.map(async (s) => {
    const [role] = await db.select({ name: serviceRolesTable.name })
      .from(serviceRolesTable)
      .where(eq(serviceRolesTable.id, s.serviceRoleId)).limit(1);
    return serializeSchedule(s, role?.name);
  }));

  res.json({ schedule: enriched });
});

// POST /events/:eventId/schedule
router.post("/:eventId/schedule", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { eventId } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  // Check event exists
  const [event] = await db.select().from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), isNull(eventsTable.deletedAt)));
  if (!event) {
    res.status(404).json({ error: "Evento nao encontrado" });
    return;
  }

  const { serviceRoleId, memberId, notes } = req.body;

  if (!serviceRoleId || !memberId) {
    res.status(400).json({ error: "serviceRoleId e memberId sao obrigatorios" });
    return;
  }

  // Check role exists
  const [role] = await db.select().from(serviceRolesTable)
    .where(and(eq(serviceRolesTable.id, serviceRoleId), isNull(serviceRolesTable.deletedAt)));
  if (!role) {
    res.status(404).json({ error: "Funcao nao encontrada" });
    return;
  }

  // Check member exists
  const [member] = await db.select().from(membersTable)
    .where(eq(membersTable.id, memberId)).limit(1);
  if (!member) {
    res.status(404).json({ error: "Membro nao encontrado" });
    return;
  }

  // Check no duplicate
  const [existing] = await db.select().from(eventSchedulesTable)
    .where(and(
      eq(eventSchedulesTable.eventId, eventId),
      eq(eventSchedulesTable.serviceRoleId, serviceRoleId),
      eq(eventSchedulesTable.memberId, memberId),
    )).limit(1);
  if (existing) {
    res.status(409).json({ error: "Membro ja escalado para esta funcao neste evento" });
    return;
  }

  const [schedule] = await db.insert(eventSchedulesTable).values({
    eventId,
    serviceRoleId,
    memberId,
    memberName: member.fullName,
    notes: notes || null,
    createdByUserId: user.userId,
    updatedByUserId: user.userId,
  }).returning();

  await createAuditLog({
    userId: user.userId,
    action: "SCHEDULE_CREATED",
    resourceType: "event_schedule",
    resourceId: schedule.id,
    details: { eventId, serviceRoleId, memberId, roleName: role.name },
    ipAddress: ip,
  });

  const eventDate = event.startDate?.toLocaleDateString("pt-BR") ?? "";
  await notifyMember(memberId, {
    type: "schedule.assigned",
    title: "Você foi escalado",
    message: `Você foi escalado como ${role.name} em "${event.title}" — ${eventDate}.`,
    link: `/events/${eventId}`,
    entityType: "event_schedule",
    entityId: schedule.id,
  });

  res.status(201).json(serializeSchedule(schedule, role.name));
});

// PUT /events/:eventId/schedule/:id
router.put("/:eventId/schedule/:id", requireAuth, async (req: Request, res: Response) => {
  const { eventId, id } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  const [existing] = await db.select().from(eventSchedulesTable)
    .where(and(
      eq(eventSchedulesTable.id, id),
      eq(eventSchedulesTable.eventId, eventId),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Escala nao encontrada" });
    return;
  }

  const { status, notes } = req.body;
  const VALID_STATUSES = ["escalado", "confirmado", "ausente", "substituido"];

  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Status invalido. Valores aceitos: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  // Access control: admin/leader can change anything, member can only confirm/absent own
  if (user.role !== "admin" && user.role !== "leader") {
    const isSelf = await isSelfMember(user.email, existing.memberId);
    if (!isSelf) {
      res.status(403).json({ error: "Sem permissao para alterar esta escala" });
      return;
    }
    if (status && status !== "confirmado" && status !== "ausente") {
      res.status(403).json({ error: "Voluntario pode apenas confirmar ou informar ausencia" });
      return;
    }
  }

  const updates: Record<string, any> = {
    updatedByUserId: user.userId,
    updatedAt: new Date(),
  };
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes || null;

  const [updated] = await db.update(eventSchedulesTable).set(updates)
    .where(eq(eventSchedulesTable.id, id)).returning();

  await createAuditLog({
    userId: user.userId,
    action: "SCHEDULE_STATUS_CHANGED",
    resourceType: "event_schedule",
    resourceId: id,
    details: { eventId, oldStatus: existing.status, newStatus: status },
    ipAddress: ip,
  });

  res.json(serializeSchedule(updated));
});

// DELETE /events/:eventId/schedule/:id
router.delete("/:eventId/schedule/:id", requireAuth, requireRole("admin", "leader"), async (req: Request, res: Response) => {
  const { eventId, id } = req.params;
  const user = req.user!;
  const ip = getIp(req);

  const [existing] = await db.select().from(eventSchedulesTable)
    .where(and(
      eq(eventSchedulesTable.id, id),
      eq(eventSchedulesTable.eventId, eventId),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Escala nao encontrada" });
    return;
  }

  await db.delete(eventSchedulesTable).where(eq(eventSchedulesTable.id, id));

  await createAuditLog({
    userId: user.userId,
    action: "SCHEDULE_DELETED",
    resourceType: "event_schedule",
    resourceId: id,
    details: { eventId, memberId: existing.memberId, memberName: existing.memberName },
    ipAddress: ip,
  });

  res.json({ message: "Voluntario removido da escala" });
});

export default router;
