import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  membersTable,
  financeEntriesTable,
  financeExpensesTable,
  eventsTable,
  coursesTable,
  courseEnrollmentsTable,
  ministriesTable,
  ministryMembersTable,
  planningInitiativesTable,
  pastoralVisitsTable,
  counselingCasesTable,
  articlesTable,
  eventRegistrationsTable,
  visitorsTable,
  memberAreasTable,
} from "@workspace/db";
import { eq, and, isNull, gte, lte, count, sql, sum, desc, or, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

function lastDayOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
}

// GET /dashboard/stats — admin sees everything, leader sees everything EXCEPT finance
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role === "member") {
    return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão" });
  }
  const isAdmin = user.role === "admin";
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const currentMonthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const currentMonthEnd = lastDayOfMonth(currentYear, currentMonth);
  const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevMonthEnd = lastDayOfMonth(prevYear, prevMonth);

  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);

  // ─── Members ───────────────────────────────────────────────────────────
  const [membersActive] = await db.select({ total: count() }).from(membersTable)
    .where(eq(membersTable.status, "ativo"));

  const [membersNew] = await db.select({ total: count() }).from(membersTable)
    .where(gte(membersTable.createdAt, firstDayOfMonth));

  const membersByStatus = await db.select({
    status: membersTable.status,
    total: count(),
  }).from(membersTable).groupBy(membersTable.status);

  const statusMap: Record<string, number> = {};
  for (const s of membersByStatus) {
    statusMap[s.status] = Number(s.total);
  }

  // Visitantes ativos (recente + acompanhando) — fonte: tabela visitors
  const [activeVisitors] = await db.select({ total: count() }).from(visitorsTable)
    .where(and(
      isNull(visitorsTable.deletedAt),
      inArray(visitorsTable.status, ["recente", "acompanhando"]),
    ));

  // ─── Finance (admin only) ──────────────────────────────────────────────
  let financePayload: any = null;
  if (isAdmin) {
    const [currentEntries] = await db.select({ total: sum(financeEntriesTable.amount) })
      .from(financeEntriesTable)
      .where(and(
        isNull(financeEntriesTable.deletedAt),
        gte(financeEntriesTable.date, currentMonthStart),
        lte(financeEntriesTable.date, currentMonthEnd),
      ));

    const [currentExpenses] = await db.select({ total: sum(financeExpensesTable.amount) })
      .from(financeExpensesTable)
      .where(and(
        isNull(financeExpensesTable.deletedAt),
        gte(financeExpensesTable.date, currentMonthStart),
        lte(financeExpensesTable.date, currentMonthEnd),
      ));

    const [prevEntries] = await db.select({ total: sum(financeEntriesTable.amount) })
      .from(financeEntriesTable)
      .where(and(
        isNull(financeEntriesTable.deletedAt),
        gte(financeEntriesTable.date, prevMonthStart),
        lte(financeEntriesTable.date, prevMonthEnd),
      ));

    const [prevExpenses] = await db.select({ total: sum(financeExpensesTable.amount) })
      .from(financeExpensesTable)
      .where(and(
        isNull(financeExpensesTable.deletedAt),
        gte(financeExpensesTable.date, prevMonthStart),
        lte(financeExpensesTable.date, prevMonthEnd),
      ));

    const curEntriesVal = parseFloat(currentEntries.total ?? "0");
    const curExpensesVal = parseFloat(currentExpenses.total ?? "0");
    const prevEntriesVal = parseFloat(prevEntries.total ?? "0");
    const prevExpensesVal = parseFloat(prevExpenses.total ?? "0");

    const entriesGrowth = prevEntriesVal > 0
      ? Math.round(((curEntriesVal - prevEntriesVal) / prevEntriesVal) * 100)
      : 0;

    financePayload = {
      currentMonth: {
        totalEntries: curEntriesVal.toFixed(2),
        totalExpenses: curExpensesVal.toFixed(2),
        balance: (curEntriesVal - curExpensesVal).toFixed(2),
      },
      previousMonth: {
        totalEntries: prevEntriesVal.toFixed(2),
        totalExpenses: prevExpensesVal.toFixed(2),
      },
      entriesGrowth,
    };
  }

  // ─── Events ────────────────────────────────────────────────────────────
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [upcomingCount] = await db.select({ total: count() }).from(eventsTable)
    .where(and(
      isNull(eventsTable.deletedAt),
      gte(eventsTable.startDate, now),
      lte(eventsTable.startDate, nextWeek),
    ));

  const [nextMonthCount] = await db.select({ total: count() }).from(eventsTable)
    .where(and(
      isNull(eventsTable.deletedAt),
      gte(eventsTable.startDate, now),
      lte(eventsTable.startDate, nextMonth),
    ));

  const upcomingEvents = await db.select().from(eventsTable)
    .where(and(
      isNull(eventsTable.deletedAt),
      gte(eventsTable.startDate, now),
    ))
    .orderBy(eventsTable.startDate)
    .limit(3);

  // ─── Teaching ──────────────────────────────────────────────────────────
  const [activeCourses] = await db.select({ total: count() }).from(coursesTable)
    .where(eq(coursesTable.status, "em_andamento"));

  const [totalEnrollments] = await db.select({ total: count() }).from(courseEnrollmentsTable)
    .where(isNull(courseEnrollmentsTable.completedAt));

  // ─── Ministries ────────────────────────────────────────────────────────
  const [ministriesTotal] = await db.select({ total: count() }).from(ministriesTable)
    .where(and(isNull(ministriesTable.deletedAt), eq(ministriesTable.status, "ativo")));

  const [ministryMembersTotal] = await db.select({ total: count() }).from(ministryMembersTable)
    .where(isNull(ministryMembersTable.leftAt));

  // ─── Small Groups (PG) ─────────────────────────────────────────────────
  const pgRows = await db.select({
    leaderMemberId: memberAreasTable.leaderMemberId,
    healthStatus: memberAreasTable.healthStatus,
  }).from(memberAreasTable)
    .where(eq(memberAreasTable.area, "pequeno_grupo"));

  const distinctLeaders = new Set(
    pgRows.filter(r => r.leaderMemberId).map(r => r.leaderMemberId!),
  );
  const verde = pgRows.filter(r => r.healthStatus === "verde").length;
  const amarelo = pgRows.filter(r => r.healthStatus === "amarelo").length;
  const vermelho = pgRows.filter(r => r.healthStatus === "vermelho").length;
  const smallGroupsPayload = {
    groupCount: distinctLeaders.size,
    activeMemberCount: verde + amarelo,
    healthBreakdown: { verde, amarelo, vermelho },
  };

  // ─── Response ──────────────────────────────────────────────────────────
  res.json({
    members: {
      total: Number(membersActive.total),
      newThisMonth: Number(membersNew.total),
      byStatus: {
        ativo: statusMap.ativo || 0,
        disciplina: statusMap.disciplina || 0,
        rolApartado: statusMap.rol_apartado || 0,
        falecido: statusMap.falecido || 0,
        demitido: statusMap.demitido || 0,
        visitantes: Number(activeVisitors.total),
      },
    },
    finance: financePayload,
    events: {
      upcomingCount: Number(upcomingCount.total),
      nextMonthCount: Number(nextMonthCount.total),
      upcoming: upcomingEvents.map(e => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate?.toISOString(),
        type: e.type,
        location: e.location,
      })),
    },
    teaching: {
      activeCourses: Number(activeCourses.total),
      totalEnrollments: Number(totalEnrollments.total),
    },
    ministries: {
      total: Number(ministriesTotal.total),
      totalMembers: Number(ministryMembersTotal.total),
    },
    smallGroups: smallGroupsPayload,
    planning: await (async () => {
      const initiatives = await db.select().from(planningInitiativesTable)
        .where(isNull(planningInitiativesTable.deletedAt));
      let active = 0;
      let overdue = 0;
      for (const i of initiatives) {
        if (i.status === "planejada" || i.status === "aprovada" || i.status === "em_andamento") active++;
        if (i.endDate && new Date(i.endDate) < now && i.status !== "concluida" && i.status !== "cancelada") overdue++;
      }
      return { activeInitiatives: active, overdueInitiatives: overdue };
    })(),
  });
});

// ─── LEADER PERSONAL WIDGETS ────────────────────────────────────────────────
// GET /dashboard/leader-widgets — "my" data for leader (pastoral, counseling, articles)
router.get("/leader-widgets", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "leader") {
    return res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão" });
  }

  // Find member linked to this user's email
  const [linkedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.email, user.email)).limit(1);

  const today = new Date().toISOString().slice(0, 10);

  let myPastoralPending = 0;
  let myPastoralOverdue = 0;
  let myCounselingOpen = 0;

  if (linkedMember) {
    // Pastoral visits where I'm the pastor
    const pastoralRows = await db.select().from(pastoralVisitsTable)
      .where(and(
        isNull(pastoralVisitsTable.deletedAt),
        eq(pastoralVisitsTable.pastorId, linkedMember.id),
      ));
    for (const v of pastoralRows) {
      if (v.status === "pendente") {
        myPastoralPending++;
        if (v.followUpDate && v.followUpDate < today) myPastoralOverdue++;
      }
    }

    // Counseling cases where I'm the counselor
    const counselingRows = await db.select().from(counselingCasesTable)
      .where(and(
        isNull(counselingCasesTable.deletedAt),
        eq(counselingCasesTable.counselorId, linkedMember.id),
      ));
    for (const c of counselingRows) {
      if (c.status === "aberto" || c.status === "em_andamento") myCounselingOpen++;
    }
  }

  // Articles I've authored that are in draft or review
  const myArticlesRows = await db.select({ id: articlesTable.id, status: articlesTable.status, title: articlesTable.title }).from(articlesTable)
    .where(and(
      isNull(articlesTable.deletedAt),
      eq(articlesTable.authorId, user.userId),
    ));
  const myArticlesInReview = myArticlesRows.filter(a => a.status === "em_revisao").length;
  const myArticlesDraft = myArticlesRows.filter(a => a.status === "rascunho").length;

  res.json({
    pastoral: { pending: myPastoralPending, overdueFollowUps: myPastoralOverdue },
    counseling: { openCases: myCounselingOpen },
    articles: { inReview: myArticlesInReview, drafts: myArticlesDraft },
  });
});

// ─── MEMBER DASHBOARD ───────────────────────────────────────────────────────
// GET /dashboard/member-stats — personal data for member
router.get("/member-stats", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;

  // Find member record by email
  const [linkedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.email, user.email)).limit(1);

  if (!linkedMember) {
    return res.json({
      profile: null,
      enrolledCourses: 0,
      upcomingRegisteredEvents: [],
      myMinistries: [],
      nextEvent: null,
      recentArticles: [],
    });
  }

  // Enrolled courses (active)
  const enrollments = await db.select().from(courseEnrollmentsTable)
    .where(and(
      eq(courseEnrollmentsTable.memberId, linkedMember.id),
      isNull(courseEnrollmentsTable.completedAt),
    ));

  // Registered upcoming events
  const registrations = await db.select().from(eventRegistrationsTable)
    .where(eq(eventRegistrationsTable.memberId, linkedMember.id));
  const eventIds = registrations.map(r => r.eventId);

  let upcomingRegistered: any[] = [];
  let nextEvent: any = null;
  if (eventIds.length > 0) {
    const regEvents = await db.select().from(eventsTable)
      .where(and(
        isNull(eventsTable.deletedAt),
        gte(eventsTable.startDate, new Date()),
        inArray(eventsTable.id, eventIds),
      ))
      .orderBy(eventsTable.startDate)
      .limit(5);
    upcomingRegistered = regEvents.map(e => ({
      id: e.id, title: e.title, startDate: e.startDate?.toISOString(),
      type: e.type, location: e.location,
    }));
    if (upcomingRegistered.length > 0) nextEvent = upcomingRegistered[0];
  }

  // My ministries
  const ministryMemberships = await db.select().from(ministryMembersTable)
    .where(and(
      eq(ministryMembersTable.memberId, linkedMember.id),
      isNull(ministryMembersTable.leftAt),
    ));
  const ministryIds = ministryMemberships.map(m => m.ministryId);
  let myMinistries: any[] = [];
  if (ministryIds.length > 0) {
    const ms = await db.select().from(ministriesTable)
      .where(and(
        isNull(ministriesTable.deletedAt),
        inArray(ministriesTable.id, ministryIds),
      ));
    myMinistries = ms.map(m => {
      const mm = ministryMemberships.find(x => x.ministryId === m.id);
      return { id: m.id, name: m.name, role: mm?.role || "membro" };
    });
  }

  // Recently published articles (last 5)
  const recentArticles = await db.select({
    id: articlesTable.id, title: articlesTable.title, excerpt: articlesTable.excerpt,
    authorName: articlesTable.authorName, publishedAt: articlesTable.publishedAt, category: articlesTable.category,
  }).from(articlesTable)
    .where(and(
      isNull(articlesTable.deletedAt),
      eq(articlesTable.status, "publicado"),
    ))
    .orderBy(desc(articlesTable.publishedAt))
    .limit(5);

  const memberAreas = await db.select({
    area: memberAreasTable.area,
    healthStatus: memberAreasTable.healthStatus,
    leaderMemberName: memberAreasTable.leaderMemberName,
  }).from(memberAreasTable).where(eq(memberAreasTable.memberId, linkedMember.id));

  res.json({
    profile: {
      id: linkedMember.id,
      fullName: linkedMember.fullName,
      status: linkedMember.status,
      receptionDate: linkedMember.receptionDate,
      classification: linkedMember.classification,
      receptionMode: linkedMember.receptionMode,
      areas: memberAreas,
    },
    enrolledCourses: enrollments.length,
    upcomingRegisteredEvents: upcomingRegistered,
    nextEvent,
    myMinistries,
    recentArticles: recentArticles.map(a => ({
      ...a,
      publishedAt: a.publishedAt?.toISOString() || null,
    })),
  });
});

export default router;
