import { pgTable, text, timestamp, boolean, pgEnum, integer, date } from "drizzle-orm/pg-core";

export const courseCategoryEnum = pgEnum("course_category", [
  "pregacao",
  "escola_biblica",
  "pequeno_grupo",
  "cursos_livres",
]);

export const courseStatusEnum = pgEnum("course_status", [
  "aberto",
  "em_andamento",
  "encerrado",
]);

// ─── COURSES ─────────────────────────────────────────────────────────────────

export const coursesTable = pgTable("courses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  syllabus: text("syllabus"),
  introVideoUrl: text("intro_video_url"),

  teacherId: text("teacher_id").notNull(),
  teacherName: text("teacher_name"),

  category: courseCategoryEnum("category").notNull(),
  status: courseStatusEnum("status").notNull().default("aberto"),

  startDate: date("start_date"),
  endDate: date("end_date"),
  dayOfWeek: text("day_of_week"),
  timeSlot: text("time_slot"),
  location: text("location"),
  lessonDurationMinutes: integer("lesson_duration_minutes"),
  totalWeeks: integer("total_weeks"),

  maxSlots: integer("max_slots"),

  // Soft delete
  deletedAt: timestamp("deleted_at"),

  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── COURSE LESSONS ──────────────────────────────────────────────────────────

export const courseLessonsTable = pgTable("course_lessons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  content: text("content"),
  videoUrl: text("video_url"),
  lessonDate: date("lesson_date"),
  lessonOrder: integer("lesson_order").notNull(),
  materialPath: text("material_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── LESSON DISCUSSIONS (Q&A forum per lesson) ───────────────────────────────

export const lessonDiscussionsTable = pgTable("lesson_discussions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lessonId: text("lesson_id").notNull(),
  authorId: text("author_id").notNull(), // user id
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  parentId: text("parent_id"), // nullable — null = top-level question, otherwise = reply
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// ─── COURSE ENROLLMENTS ──────────────────────────────────────────────────────

export const courseEnrollmentsTable = pgTable("course_enrollments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id").notNull(),
  memberId: text("member_id").notNull(),
  memberName: text("member_name"),
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  certificatePath: text("certificate_path"),
});

// ─── LESSON ATTENDANCE ───────────────────────────────────────────────────────

export const lessonAttendanceTable = pgTable("lesson_attendance", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lessonId: text("lesson_id").notNull(),
  memberId: text("member_id").notNull(),
  present: boolean("present").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Course = typeof coursesTable.$inferSelect;
export type CourseLesson = typeof courseLessonsTable.$inferSelect;
export type CourseEnrollment = typeof courseEnrollmentsTable.$inferSelect;
export type LessonAttendance = typeof lessonAttendanceTable.$inferSelect;
export type LessonDiscussion = typeof lessonDiscussionsTable.$inferSelect;
