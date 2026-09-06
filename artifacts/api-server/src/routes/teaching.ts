import { findLinkedMember } from "../lib/memberLink.js";
import { Router, type IRouter, Request, Response } from "express";
import {
  db,
  coursesTable,
  courseLessonsTable,
  courseEnrollmentsTable,
  lessonAttendanceTable,
  lessonDiscussionsTable,
  membersTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and, isNull, sql, count, sum, gte, lte, asc, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router: IRouter = Router();

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

const VALID_CATEGORIES = ["pregacao", "escola_biblica", "pequeno_grupo", "cursos_livres"] as const;

function serializeCourse(c: typeof coursesTable.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    syllabus: c.syllabus,
    introVideoUrl: c.introVideoUrl,
    teacherId: c.teacherId,
    teacherName: c.teacherName,
    category: c.category,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    dayOfWeek: c.dayOfWeek,
    timeSlot: c.timeSlot,
    location: c.location,
    lessonDurationMinutes: c.lessonDurationMinutes,
    totalWeeks: c.totalWeeks,
    maxSlots: c.maxSlots,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function serializeLesson(l: typeof courseLessonsTable.$inferSelect) {
  return {
    id: l.id,
    courseId: l.courseId,
    title: l.title,
    description: l.description,
    content: l.content,
    videoUrl: l.videoUrl,
    lessonDate: l.lessonDate,
    lessonOrder: l.lessonOrder,
    materialPath: l.materialPath,
    createdAt: l.createdAt,
  };
}

function serializeDiscussion(d: typeof lessonDiscussionsTable.$inferSelect) {
  return {
    id: d.id,
    lessonId: d.lessonId,
    authorId: d.authorId,
    authorName: d.authorName,
    body: d.body,
    parentId: d.parentId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// ─── Helper: check if user is teacher of a course ────────────────────────────

async function isTeacherOf(courseId: string, userId: string, user: NonNullable<Request["user"]>): Promise<boolean> {
  const [course] = await db.select({ teacherId: coursesTable.teacherId })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  if (!course) return false;

  // Match by member ID linked to user (teacher is a member)
  const member = await findLinkedMember(user);

  return member?.id === course.teacherId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COURSES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /teaching/courses
router.get("/courses", requireAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;
  const mine = req.query.mine === "true";

  const conditions = [isNull(coursesTable.deletedAt)];
  if (status) conditions.push(eq(coursesTable.status, status as "aberto"));
  if (category) conditions.push(eq(coursesTable.category, category as "pregacao"));

  // Filter to only courses the current user is enrolled in
  if (mine) {
    const linkedMember = await findLinkedMember(req.user!);
    if (!linkedMember) {
      res.json({ courses: [], total: 0, page, limit });
      return;
    }
    const myEnrollments = await db.select({ courseId: courseEnrollmentsTable.courseId })
      .from(courseEnrollmentsTable)
      .where(eq(courseEnrollmentsTable.memberId, linkedMember.id));
    const enrolledCourseIds = myEnrollments.map(e => e.courseId);
    if (enrolledCourseIds.length === 0) {
      res.json({ courses: [], total: 0, page, limit });
      return;
    }
    conditions.push(inArray(coursesTable.id, enrolledCourseIds));
  }

  const where = and(...conditions);

  const [courses, [{ total }]] = await Promise.all([
    db.select().from(coursesTable).where(where)
      .orderBy(desc(coursesTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(coursesTable).where(where),
  ]);

  // Get enrollment counts
  const courseIds = courses.map(c => c.id);
  const enrollmentCounts = courseIds.length > 0
    ? await db.select({
        courseId: courseEnrollmentsTable.courseId,
        count: count(),
      })
      .from(courseEnrollmentsTable)
      .where(sql`${courseEnrollmentsTable.courseId} IN (${sql.join(courseIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(courseEnrollmentsTable.courseId)
    : [];

  const countMap = new Map(enrollmentCounts.map(e => [e.courseId, Number(e.count)]));

  res.json({
    courses: courses.map(c => ({
      ...serializeCourse(c),
      enrolledCount: countMap.get(c.id) || 0,
    })),
    total: Number(total),
    page,
    limit,
  });
});

// GET /teaching/courses/:id
router.get("/courses/:id", requireAuth, async (req: Request, res: Response) => {
  const [course] = await db.select().from(coursesTable)
    .where(and(eq(coursesTable.id, req.params.id), isNull(coursesTable.deletedAt)))
    .limit(1);

  if (!course) {
    res.status(404).json({ error: "NOT_FOUND", message: "Curso não encontrado" });
    return;
  }

  const [lessons, enrollments] = await Promise.all([
    db.select().from(courseLessonsTable)
      .where(eq(courseLessonsTable.courseId, course.id))
      .orderBy(asc(courseLessonsTable.lessonOrder)),
    db.select().from(courseEnrollmentsTable)
      .where(eq(courseEnrollmentsTable.courseId, course.id))
      .orderBy(asc(courseEnrollmentsTable.enrolledAt)),
  ]);

  res.json({
    ...serializeCourse(course),
    lessons: lessons.map(serializeLesson),
    enrollments: enrollments.map(e => ({
      id: e.id,
      memberId: e.memberId,
      memberName: e.memberName,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt,
      certificatePath: e.certificatePath,
    })),
  });
});

// POST /teaching/courses
router.post("/courses", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);
  const { title, description, syllabus, introVideoUrl, teacherId, category, status, startDate, endDate, dayOfWeek, timeSlot, location, lessonDurationMinutes, totalWeeks, maxSlots } = req.body;

  if (!title || !teacherId || !category) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: título, professor, categoria" });
    return;
  }
  if (!(VALID_CATEGORIES as readonly string[]).includes(category)) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Categoria inválida. Aceitas: ${VALID_CATEGORIES.join(", ")}`,
    });
    return;
  }

  // Get teacher name snapshot
  let teacherName: string | null = null;
  const [teacher] = await db.select({ fullName: membersTable.fullName })
    .from(membersTable).where(eq(membersTable.id, teacherId)).limit(1);
  teacherName = teacher?.fullName ?? null;

  const [course] = await db.insert(coursesTable).values({
    title,
    description: description ?? null,
    syllabus: syllabus ?? null,
    introVideoUrl: introVideoUrl ?? null,
    teacherId,
    teacherName,
    category: category as "pregacao",
    status: (status ?? "aberto") as "aberto",
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    dayOfWeek: dayOfWeek ?? null,
    timeSlot: timeSlot ?? null,
    location: location ?? null,
    lessonDurationMinutes: lessonDurationMinutes ?? null,
    totalWeeks: totalWeeks ?? null,
    maxSlots: maxSlots ?? null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }).returning();

  await createAuditLog({
    userId,
    action: "COURSE_CREATED",
    resourceType: "course",
    resourceId: course.id,
    details: { title, category },
    ipAddress: ip,
  });

  res.status(201).json(serializeCourse(course));
});

// PUT /teaching/courses/:id
router.put("/courses/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [existing] = await db.select().from(coursesTable)
    .where(and(eq(coursesTable.id, req.params.id), isNull(coursesTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Curso não encontrado" });
    return;
  }

  // Only admin or the teacher can edit
  if (role !== "admin") {
    const isTeacher = await isTeacherOf(existing.id, userId, req.user!);
    if (!isTeacher) {
      res.status(403).json({ error: "FORBIDDEN", message: "Apenas administradores ou o professor podem editar este curso" });
      return;
    }
  }

  const { title, description, syllabus, introVideoUrl, teacherId, category, status, startDate, endDate, dayOfWeek, timeSlot, location, lessonDurationMinutes, totalWeeks, maxSlots } = req.body;

  if (category !== undefined && !(VALID_CATEGORIES as readonly string[]).includes(category)) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Categoria inválida. Aceitas: ${VALID_CATEGORIES.join(", ")}`,
    });
    return;
  }

  let teacherName = existing.teacherName;
  if (teacherId && teacherId !== existing.teacherId) {
    const [teacher] = await db.select({ fullName: membersTable.fullName })
      .from(membersTable).where(eq(membersTable.id, teacherId)).limit(1);
    teacherName = teacher?.fullName ?? null;
  }

  const [updated] = await db.update(coursesTable).set({
    title: title ?? existing.title,
    description: description !== undefined ? description : existing.description,
    syllabus: syllabus !== undefined ? syllabus : existing.syllabus,
    introVideoUrl: introVideoUrl !== undefined ? introVideoUrl : existing.introVideoUrl,
    teacherId: teacherId ?? existing.teacherId,
    teacherName,
    category: category ?? existing.category,
    status: status ?? existing.status,
    startDate: startDate !== undefined ? startDate : existing.startDate,
    endDate: endDate !== undefined ? endDate : existing.endDate,
    dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : existing.dayOfWeek,
    timeSlot: timeSlot !== undefined ? timeSlot : existing.timeSlot,
    location: location !== undefined ? location : existing.location,
    lessonDurationMinutes: lessonDurationMinutes !== undefined ? lessonDurationMinutes : existing.lessonDurationMinutes,
    totalWeeks: totalWeeks !== undefined ? totalWeeks : existing.totalWeeks,
    maxSlots: maxSlots !== undefined ? maxSlots : existing.maxSlots,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(coursesTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "COURSE_UPDATED",
    resourceType: "course",
    resourceId: updated.id,
    details: { title: updated.title },
    ipAddress: ip,
  });

  res.json(serializeCourse(updated));
});

// DELETE /teaching/courses/:id (soft delete)
router.delete("/courses/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(coursesTable)
    .where(and(eq(coursesTable.id, req.params.id), isNull(coursesTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Curso não encontrado" });
    return;
  }

  await db.update(coursesTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(coursesTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "COURSE_DELETED",
    resourceType: "course",
    resourceId: existing.id,
    details: { title: existing.title },
    ipAddress: ip,
  });

  res.json({ message: "Curso excluído com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LESSONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /teaching/courses/:courseId/lessons
router.get("/courses/:courseId/lessons", requireAuth, async (req: Request, res: Response) => {
  const lessons = await db.select().from(courseLessonsTable)
    .where(eq(courseLessonsTable.courseId, req.params.courseId))
    .orderBy(asc(courseLessonsTable.lessonOrder));

  res.json({ lessons: lessons.map(serializeLesson) });
});

// POST /teaching/courses/:courseId/lessons
router.post("/courses/:courseId/lessons", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  // Check course exists
  const [course] = await db.select().from(coursesTable)
    .where(and(eq(coursesTable.id, req.params.courseId), isNull(coursesTable.deletedAt)))
    .limit(1);

  if (!course) {
    res.status(404).json({ error: "NOT_FOUND", message: "Curso não encontrado" });
    return;
  }

  // Only admin or teacher
  if (role !== "admin") {
    const isTeacher = await isTeacherOf(course.id, userId, req.user!);
    if (!isTeacher) {
      res.status(403).json({ error: "FORBIDDEN", message: "Apenas administradores ou o professor podem adicionar aulas" });
      return;
    }
  }

  const { title, description, content, videoUrl, lessonDate, lessonOrder, materialPath } = req.body;

  if (!title || lessonOrder == null) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Campos obrigatórios: título, ordem da aula" });
    return;
  }

  const [lesson] = await db.insert(courseLessonsTable).values({
    courseId: req.params.courseId,
    title,
    description: description ?? null,
    content: content ?? null,
    videoUrl: videoUrl ?? null,
    lessonDate: lessonDate ?? null,
    lessonOrder: Number(lessonOrder),
    materialPath: materialPath ?? null,
  }).returning();

  await createAuditLog({
    userId,
    action: "LESSON_CREATED",
    resourceType: "course_lesson",
    resourceId: lesson.id,
    details: { courseId: course.id, title },
    ipAddress: ip,
  });

  res.status(201).json(serializeLesson(lesson));
});

// PUT /teaching/lessons/:id
router.put("/lessons/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [existing] = await db.select().from(courseLessonsTable)
    .where(eq(courseLessonsTable.id, req.params.id)).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Aula não encontrada" });
    return;
  }

  if (role !== "admin") {
    const isTeacher = await isTeacherOf(existing.courseId, userId, req.user!);
    if (!isTeacher) {
      res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para editar esta aula" });
      return;
    }
  }

  const { title, description, content, videoUrl, lessonDate, lessonOrder, materialPath } = req.body;

  const [updated] = await db.update(courseLessonsTable).set({
    title: title ?? existing.title,
    description: description !== undefined ? description : existing.description,
    content: content !== undefined ? content : existing.content,
    videoUrl: videoUrl !== undefined ? videoUrl : existing.videoUrl,
    lessonDate: lessonDate !== undefined ? lessonDate : existing.lessonDate,
    lessonOrder: lessonOrder != null ? Number(lessonOrder) : existing.lessonOrder,
    materialPath: materialPath !== undefined ? materialPath : existing.materialPath,
    updatedAt: new Date(),
  }).where(eq(courseLessonsTable.id, req.params.id)).returning();

  await createAuditLog({
    userId,
    action: "LESSON_UPDATED",
    resourceType: "course_lesson",
    resourceId: updated.id,
    details: { title: updated.title },
    ipAddress: ip,
  });

  res.json(serializeLesson(updated));
});

// DELETE /teaching/lessons/:id
router.delete("/lessons/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [existing] = await db.select().from(courseLessonsTable)
    .where(eq(courseLessonsTable.id, req.params.id)).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Aula não encontrada" });
    return;
  }

  if (role !== "admin") {
    const isTeacher = await isTeacherOf(existing.courseId, userId, req.user!);
    if (!isTeacher) {
      res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para remover esta aula" });
      return;
    }
  }

  // Delete attendance records for this lesson first
  await db.delete(lessonAttendanceTable).where(eq(lessonAttendanceTable.lessonId, existing.id));
  await db.delete(courseLessonsTable).where(eq(courseLessonsTable.id, req.params.id));

  await createAuditLog({
    userId,
    action: "LESSON_DELETED",
    resourceType: "course_lesson",
    resourceId: existing.id,
    details: { courseId: existing.courseId, title: existing.title },
    ipAddress: ip,
  });

  res.json({ message: "Aula removida com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENROLLMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /teaching/courses/:courseId/enrollments
router.get("/courses/:courseId/enrollments", requireAuth, async (req: Request, res: Response) => {
  const enrollments = await db.select().from(courseEnrollmentsTable)
    .where(eq(courseEnrollmentsTable.courseId, req.params.courseId))
    .orderBy(asc(courseEnrollmentsTable.enrolledAt));

  res.json({ enrollments });
});

// POST /teaching/courses/:courseId/enroll
router.post("/courses/:courseId/enroll", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [course] = await db.select().from(coursesTable)
    .where(and(eq(coursesTable.id, req.params.courseId), isNull(coursesTable.deletedAt)))
    .limit(1);

  if (!course) {
    res.status(404).json({ error: "NOT_FOUND", message: "Curso não encontrado" });
    return;
  }

  // Members can self-enroll; admin can enroll anyone
  let memberId = req.body.memberId;
  if (role === "member") {
    // Self-enroll only as the member explicitly linked to this account.
    const member = await findLinkedMember(req.user!);
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

  // Check if already enrolled
  const [existing] = await db.select().from(courseEnrollmentsTable)
    .where(and(
      eq(courseEnrollmentsTable.courseId, course.id),
      eq(courseEnrollmentsTable.memberId, memberId),
    )).limit(1);

  if (existing) {
    res.status(409).json({ error: "ALREADY_ENROLLED", message: "Membro já está inscrito neste curso" });
    return;
  }

  // Check max slots
  if (course.maxSlots) {
    const [{ total }] = await db.select({ total: count() }).from(courseEnrollmentsTable)
      .where(eq(courseEnrollmentsTable.courseId, course.id));
    if (Number(total) >= course.maxSlots) {
      res.status(409).json({ error: "COURSE_FULL", message: "Curso atingiu o limite de vagas" });
      return;
    }
  }

  // Get member name
  let memberName: string | null = null;
  const [member] = await db.select({ fullName: membersTable.fullName })
    .from(membersTable).where(eq(membersTable.id, memberId)).limit(1);
  memberName = member?.fullName ?? null;

  const [enrollment] = await db.insert(courseEnrollmentsTable).values({
    courseId: course.id,
    memberId,
    memberName,
  }).returning();

  await createAuditLog({
    userId,
    action: "COURSE_ENROLLMENT_CREATED",
    resourceType: "course_enrollment",
    resourceId: enrollment.id,
    details: { courseId: course.id, memberId },
    ipAddress: ip,
  });

  res.status(201).json(enrollment);
});

// DELETE /teaching/courses/:courseId/enroll/:memberId
router.delete("/courses/:courseId/enroll/:memberId", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ip = getIp(req);

  const [existing] = await db.select().from(courseEnrollmentsTable)
    .where(and(
      eq(courseEnrollmentsTable.courseId, req.params.courseId),
      eq(courseEnrollmentsTable.memberId, req.params.memberId),
    )).limit(1);

  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Inscrição não encontrada" });
    return;
  }

  await db.delete(courseEnrollmentsTable).where(eq(courseEnrollmentsTable.id, existing.id));

  await createAuditLog({
    userId,
    action: "COURSE_ENROLLMENT_DELETED",
    resourceType: "course_enrollment",
    resourceId: existing.id,
    details: { courseId: req.params.courseId, memberId: req.params.memberId },
    ipAddress: ip,
  });

  res.json({ message: "Inscrição cancelada com sucesso" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /teaching/lessons/:lessonId/attendance
router.get("/lessons/:lessonId/attendance", requireAuth, async (req: Request, res: Response) => {
  const records = await db.select().from(lessonAttendanceTable)
    .where(eq(lessonAttendanceTable.lessonId, req.params.lessonId));

  res.json({ attendance: records });
});

// POST /teaching/lessons/:lessonId/attendance (batch)
router.post("/lessons/:lessonId/attendance", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const ip = getIp(req);

  const [lesson] = await db.select().from(courseLessonsTable)
    .where(eq(courseLessonsTable.id, req.params.lessonId)).limit(1);

  if (!lesson) {
    res.status(404).json({ error: "NOT_FOUND", message: "Aula não encontrada" });
    return;
  }

  // Only admin or teacher
  if (role !== "admin") {
    const isTeacher = await isTeacherOf(lesson.courseId, userId, req.user!);
    if (!isTeacher) {
      res.status(403).json({ error: "FORBIDDEN", message: "Sem permissão para registrar presença" });
      return;
    }
  }

  const { records } = req.body as { records: Array<{ memberId: string; present: boolean }> };
  if (!records || !Array.isArray(records)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "records é obrigatório (array de {memberId, present})" });
    return;
  }

  // Delete existing attendance for this lesson, then insert fresh
  await db.delete(lessonAttendanceTable)
    .where(eq(lessonAttendanceTable.lessonId, lesson.id));

  if (records.length > 0) {
    await db.insert(lessonAttendanceTable).values(
      records.map(r => ({
        lessonId: lesson.id,
        memberId: r.memberId,
        present: r.present,
      }))
    );
  }

  await createAuditLog({
    userId,
    action: "ATTENDANCE_RECORDED",
    resourceType: "lesson_attendance",
    resourceId: lesson.id,
    details: { courseId: lesson.courseId, totalRecords: records.length },
    ipAddress: ip,
  });

  res.json({ message: "Presença registrada com sucesso", total: records.length });
});

// GET /teaching/courses/:courseId/progress/:memberId
router.get("/courses/:courseId/progress/:memberId", requireAuth, async (req: Request, res: Response) => {
  const { courseId, memberId } = req.params;

  const lessons = await db.select({ id: courseLessonsTable.id })
    .from(courseLessonsTable)
    .where(eq(courseLessonsTable.courseId, courseId));

  const totalLessons = lessons.length;
  if (totalLessons === 0) {
    res.json({ totalLessons: 0, attendedLessons: 0, percentage: 0 });
    return;
  }

  const lessonIds = lessons.map(l => l.id);
  const [{ attended }] = await db.select({ attended: count() })
    .from(lessonAttendanceTable)
    .where(and(
      sql`${lessonAttendanceTable.lessonId} IN (${sql.join(lessonIds.map(id => sql`${id}`), sql`, `)})`,
      eq(lessonAttendanceTable.memberId, memberId),
      eq(lessonAttendanceTable.present, true),
    ));

  const attendedCount = Number(attended);
  const percentage = Math.round((attendedCount / totalLessons) * 100);

  res.json({ totalLessons, attendedLessons: attendedCount, percentage });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CERTIFICATE DATA
// ═══════════════════════════════════════════════════════════════════════════════

// GET /teaching/courses/:courseId/certificate/:memberId
router.get("/courses/:courseId/certificate/:memberId", requireAuth, async (req: Request, res: Response) => {
  const { courseId, memberId } = req.params;

  const [course] = await db.select().from(coursesTable)
    .where(eq(coursesTable.id, courseId)).limit(1);

  if (!course) {
    res.status(404).json({ error: "NOT_FOUND", message: "Curso não encontrado" });
    return;
  }

  const [enrollment] = await db.select().from(courseEnrollmentsTable)
    .where(and(
      eq(courseEnrollmentsTable.courseId, courseId),
      eq(courseEnrollmentsTable.memberId, memberId),
    )).limit(1);

  if (!enrollment) {
    res.status(404).json({ error: "NOT_FOUND", message: "Aluno não está inscrito neste curso" });
    return;
  }

  // Calculate attendance
  const lessons = await db.select({ id: courseLessonsTable.id })
    .from(courseLessonsTable)
    .where(eq(courseLessonsTable.courseId, courseId));

  const totalLessons = lessons.length;
  let attendedLessons = 0;
  let percentage = 0;

  if (totalLessons > 0) {
    const lessonIds = lessons.map(l => l.id);
    const [{ attended }] = await db.select({ attended: count() })
      .from(lessonAttendanceTable)
      .where(and(
        sql`${lessonAttendanceTable.lessonId} IN (${sql.join(lessonIds.map(id => sql`${id}`), sql`, `)})`,
        eq(lessonAttendanceTable.memberId, memberId),
        eq(lessonAttendanceTable.present, true),
      ));
    attendedLessons = Number(attended);
    percentage = Math.round((attendedLessons / totalLessons) * 100);
  }

  if (percentage < 75) {
    res.status(400).json({
      error: "INSUFFICIENT_ATTENDANCE",
      message: `Frequência de ${percentage}% é insuficiente. Mínimo: 75%.`,
      percentage,
    });
    return;
  }

  res.json({
    studentName: enrollment.memberName,
    courseName: course.title,
    courseCategory: course.category,
    teacherName: course.teacherName,
    startDate: course.startDate,
    endDate: course.endDate,
    completionDate: new Date().toISOString().split("T")[0],
    totalLessons,
    attendedLessons,
    percentage,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /teaching/dashboard
router.get("/dashboard", requireAuth, async (_req: Request, res: Response) => {
  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [
    activeCourses,
    totalEnrollments,
    upcomingLessons,
  ] = await Promise.all([
    // Active courses count
    db.select({ total: count() }).from(coursesTable)
      .where(and(
        isNull(coursesTable.deletedAt),
        sql`${coursesTable.status} IN ('aberto', 'em_andamento')`,
      )),

    // Total enrollments
    db.select({ total: count() }).from(courseEnrollmentsTable),

    // Upcoming lessons (next 7 days)
    db.select({
      lessonId: courseLessonsTable.id,
      lessonTitle: courseLessonsTable.title,
      lessonDate: courseLessonsTable.lessonDate,
      lessonOrder: courseLessonsTable.lessonOrder,
      courseId: coursesTable.id,
      courseTitle: coursesTable.title,
      teacherName: coursesTable.teacherName,
      timeSlot: coursesTable.timeSlot,
      location: coursesTable.location,
    })
    .from(courseLessonsTable)
    .innerJoin(coursesTable, eq(courseLessonsTable.courseId, coursesTable.id))
    .where(and(
      gte(courseLessonsTable.lessonDate, today),
      lte(courseLessonsTable.lessonDate, nextWeek),
      isNull(coursesTable.deletedAt),
    ))
    .orderBy(asc(courseLessonsTable.lessonDate))
    .limit(10),
  ]);

  // Calculate average attendance across all active courses
  const activeCoursesData = await db.select({ id: coursesTable.id })
    .from(coursesTable)
    .where(and(isNull(coursesTable.deletedAt), sql`${coursesTable.status} IN ('aberto', 'em_andamento')`));

  let avgAttendance = 0;
  const lowAttendanceStudents: Array<{ memberName: string; courseName: string; percentage: number }> = [];

  if (activeCoursesData.length > 0) {
    const courseIds = activeCoursesData.map(c => c.id);

    // Get all lessons from active courses
    const allLessons = await db.select({ id: courseLessonsTable.id, courseId: courseLessonsTable.courseId })
      .from(courseLessonsTable)
      .where(sql`${courseLessonsTable.courseId} IN (${sql.join(courseIds.map(id => sql`${id}`), sql`, `)})`);

    if (allLessons.length > 0) {
      const lessonIds = allLessons.map(l => l.id);

      const [totalAttendance] = await db.select({ total: count() })
        .from(lessonAttendanceTable)
        .where(and(
          sql`${lessonAttendanceTable.lessonId} IN (${sql.join(lessonIds.map(id => sql`${id}`), sql`, `)})`,
          eq(lessonAttendanceTable.present, true),
        ));

      const [totalRecords] = await db.select({ total: count() })
        .from(lessonAttendanceTable)
        .where(sql`${lessonAttendanceTable.lessonId} IN (${sql.join(lessonIds.map(id => sql`${id}`), sql`, `)})`);

      const totalAtt = Number(totalAttendance.total);
      const totalRec = Number(totalRecords.total);
      avgAttendance = totalRec > 0 ? Math.round((totalAtt / totalRec) * 100) : 0;
    }

    // Find students with < 50% attendance in active courses
    const enrollments = await db.select()
      .from(courseEnrollmentsTable)
      .where(sql`${courseEnrollmentsTable.courseId} IN (${sql.join(courseIds.map(id => sql`${id}`), sql`, `)})`);

    for (const enrollment of enrollments) {
      const courseLessons = allLessons.filter(l => l.courseId === enrollment.courseId);
      if (courseLessons.length === 0) continue;

      const lessonIds = courseLessons.map(l => l.id);
      const [{ attended }] = await db.select({ attended: count() })
        .from(lessonAttendanceTable)
        .where(and(
          sql`${lessonAttendanceTable.lessonId} IN (${sql.join(lessonIds.map(id => sql`${id}`), sql`, `)})`,
          eq(lessonAttendanceTable.memberId, enrollment.memberId),
          eq(lessonAttendanceTable.present, true),
        ));

      const pct = Math.round((Number(attended) / courseLessons.length) * 100);
      if (pct < 50) {
        const [course] = activeCoursesData.filter(c => c.id === enrollment.courseId);
        const [courseData] = await db.select({ title: coursesTable.title }).from(coursesTable)
          .where(eq(coursesTable.id, enrollment.courseId)).limit(1);
        lowAttendanceStudents.push({
          memberName: enrollment.memberName ?? "Desconhecido",
          courseName: courseData?.title ?? "",
          percentage: pct,
        });
      }
    }
  }

  res.json({
    activeCourses: Number(activeCourses[0].total),
    totalEnrollments: Number(totalEnrollments[0].total),
    avgAttendance,
    upcomingLessons,
    lowAttendanceStudents: lowAttendanceStudents.slice(0, 10),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LESSON DISCUSSIONS (Q&A forum per lesson)
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: check if user has access to a lesson's discussions
// Access = admin OR teacher of course OR enrolled member
async function canAccessLessonDiscussions(lessonId: string, userId: string, user: NonNullable<Request["user"]>, role: string): Promise<boolean> {
  if (role === "admin") return true;

  const [lesson] = await db.select().from(courseLessonsTable)
    .where(eq(courseLessonsTable.id, lessonId)).limit(1);
  if (!lesson) return false;

  // Teacher of the course
  if (role === "admin" || role === "leader") {
    const isTeacher = await isTeacherOf(lesson.courseId, userId, user);
    if (isTeacher) return true;
  }

  // Enrolled member
  const member = await findLinkedMember(user);
  if (!member) return false;

  const [enrollment] = await db.select().from(courseEnrollmentsTable)
    .where(and(
      eq(courseEnrollmentsTable.courseId, lesson.courseId),
      eq(courseEnrollmentsTable.memberId, member.id),
    )).limit(1);

  return !!enrollment;
}

// GET /teaching/lessons/:lessonId/discussions — list all discussions for a lesson
router.get("/lessons/:lessonId/discussions", requireAuth, async (req: Request, res: Response) => {
  const { lessonId } = req.params;
  const userId = req.user!.userId;
  const role = req.user!.role;

  const hasAccess = await canAccessLessonDiscussions(lessonId, userId, req.user!, role);
  if (!hasAccess) {
    res.status(403).json({ error: "FORBIDDEN", message: "Você precisa estar inscrito no curso para ver as discussões" });
    return;
  }

  const discussions = await db.select().from(lessonDiscussionsTable)
    .where(and(
      eq(lessonDiscussionsTable.lessonId, lessonId),
      isNull(lessonDiscussionsTable.deletedAt),
    ))
    .orderBy(asc(lessonDiscussionsTable.createdAt));

  res.json({ discussions: discussions.map(serializeDiscussion) });
});

// POST /teaching/lessons/:lessonId/discussions — create discussion or reply
router.post("/lessons/:lessonId/discussions", requireAuth, async (req: Request, res: Response) => {
  const { lessonId } = req.params;
  const userId = req.user!.userId;
  const role = req.user!.role;
  const { body, parentId } = req.body;

  if (!body || !body.trim()) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Conteúdo obrigatório" });
    return;
  }

  const hasAccess = await canAccessLessonDiscussions(lessonId, userId, req.user!, role);
  if (!hasAccess) {
    res.status(403).json({ error: "FORBIDDEN", message: "Você precisa estar inscrito no curso para comentar" });
    return;
  }

  // Look up user's name
  const [u] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, userId)).limit(1);
  const authorName = u?.name || req.user!.email.split("@")[0];

  const [discussion] = await db.insert(lessonDiscussionsTable).values({
    lessonId,
    authorId: userId,
    authorName,
    body: body.trim(),
    parentId: parentId || null,
  }).returning();

  await createAuditLog({
    userId,
    action: "LESSON_DISCUSSION_CREATED",
    resourceType: "lesson_discussion",
    resourceId: discussion.id,
    details: { lessonId, parentId: parentId || null },
    ipAddress: getIp(req),
  });

  res.status(201).json(serializeDiscussion(discussion));
});

// PUT /teaching/discussions/:id — edit own discussion
router.put("/discussions/:id", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = req.user!.role;
  const { body } = req.body;

  if (!body || !body.trim()) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "Conteúdo obrigatório" });
    return;
  }

  const [existing] = await db.select().from(lessonDiscussionsTable)
    .where(and(eq(lessonDiscussionsTable.id, id), isNull(lessonDiscussionsTable.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Comentário não encontrado" });
    return;
  }

  if (existing.authorId !== userId && role !== "admin") {
    res.status(403).json({ error: "FORBIDDEN", message: "Você só pode editar seus próprios comentários" });
    return;
  }

  const [updated] = await db.update(lessonDiscussionsTable).set({
    body: body.trim(),
    updatedAt: new Date(),
  }).where(eq(lessonDiscussionsTable.id, id)).returning();

  res.json(serializeDiscussion(updated));
});

// DELETE /teaching/discussions/:id — delete own discussion (soft)
router.delete("/discussions/:id", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = req.user!.role;

  const [existing] = await db.select().from(lessonDiscussionsTable)
    .where(and(eq(lessonDiscussionsTable.id, id), isNull(lessonDiscussionsTable.deletedAt))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "NOT_FOUND", message: "Comentário não encontrado" });
    return;
  }

  if (existing.authorId !== userId && role !== "admin") {
    res.status(403).json({ error: "FORBIDDEN", message: "Você só pode remover seus próprios comentários" });
    return;
  }

  await db.update(lessonDiscussionsTable).set({
    deletedAt: new Date(),
  }).where(eq(lessonDiscussionsTable.id, id));

  await createAuditLog({
    userId,
    action: "LESSON_DISCUSSION_DELETED",
    resourceType: "lesson_discussion",
    resourceId: id,
    ipAddress: getIp(req),
  });

  res.json({ message: "Comentário removido" });
});

export default router;
