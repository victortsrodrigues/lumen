import { randomUUID } from "crypto";
import { and, count, eq, ne, or } from "drizzle-orm";
import {
  articlesTable,
  assetsTable,
  auditLogsTable,
  consentRecordsTable,
  contentsTable,
  counselingCasesTable,
  counselingSessionsTable,
  courseEnrollmentsTable,
  coursesTable,
  db,
  eventAttendanceTable,
  eventRegistrationsTable,
  eventSchedulesTable,
  eventsTable,
  financeEntriesTable,
  forumRepliesTable,
  forumTopicsTable,
  lessonAttendanceTable,
  lessonDiscussionsTable,
  lgpdRequestsTable,
  memberAreaHistoryTable,
  memberAreasTable,
  memberChildrenTable,
  memberGroupMembersTable,
  memberHistoryTable,
  membersTable,
  ministryMembersTable,
  notificationsTable,
  pastoralVisitsTable,
  pixDonationsTable,
  planningInitiativesTable,
  songSuggestionsTable,
  usersTable,
  visitorsTable,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";

export class LastActiveAdminError extends Error {
  constructor() {
    super("O último administrador ativo não pode excluir a própria conta");
    this.name = "LastActiveAdminError";
  }
}

/**
 * Deletes account-owned data and anonymizes records that the church must keep
 * for operational continuity. All database changes are atomic.
 */
export async function deleteOwnAccountData(userId: string): Promise<{ deletionReference: string }> {
  const deletionReference = randomUUID();
  const anonymousActor = `deleted:${deletionReference}`;

  const filePaths = await db.transaction(async (tx) => {
    const [account] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");

    if (account.role === "admin") {
      const [{ total }] = await tx.select({ total: count() }).from(usersTable)
        .where(and(eq(usersTable.role, "admin"), eq(usersTable.status, "active")));
      if (Number(total) <= 1) throw new LastActiveAdminError();
    }

    let member = account.memberId
      ? (await tx.select().from(membersTable).where(eq(membersTable.id, account.memberId)).limit(1))[0]
      : undefined;
    if (!member) {
      const matches = await tx.select().from(membersTable)
        .where(eq(membersTable.email, account.email)).limit(2);
      if (matches.length === 1) member = matches[0];
    }

    const paths = new Set<string>();
    const addManagedFile = (filePath?: string | null) => {
      if (filePath?.startsWith("/objects/")) paths.add(filePath);
    };
    addManagedFile(member?.photoPath);
    addManagedFile(member?.exclusionLetterPath);

    await tx.update(usersTable).set({
      status: "deleting",
      sessionVersion: account.sessionVersion + 1,
      statusReason: "Exclusão solicitada pelo titular",
      statusChangedAt: new Date(),
      statusChangedByUserId: account.id,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, account.id));

    if (member) {
      const enrollments = await tx.select({ certificatePath: courseEnrollmentsTable.certificatePath })
        .from(courseEnrollmentsTable).where(eq(courseEnrollmentsTable.memberId, member.id));
      for (const enrollment of enrollments) {
        addManagedFile(enrollment.certificatePath);
      }

      if (member.spouseMemberId) {
        await tx.update(membersTable).set({
          spouseMemberId: null,
          updatedByUserId: anonymousActor,
          updatedAt: new Date(),
        }).where(eq(membersTable.id, member.spouseMemberId));
      }

      await tx.delete(memberChildrenTable).where(or(
        eq(memberChildrenTable.parentId, member.id),
        eq(memberChildrenTable.childId, member.id),
      ));
      await tx.delete(memberGroupMembersTable).where(eq(memberGroupMembersTable.memberId, member.id));
      await tx.delete(memberAreasTable).where(eq(memberAreasTable.memberId, member.id));
      await tx.update(memberAreasTable).set({ leaderMemberId: null, leaderMemberName: null })
        .where(eq(memberAreasTable.leaderMemberId, member.id));
      await tx.update(memberAreaHistoryTable).set({ reason: null })
        .where(eq(memberAreaHistoryTable.memberId, member.id));

      await tx.delete(courseEnrollmentsTable).where(eq(courseEnrollmentsTable.memberId, member.id));
      await tx.delete(lessonAttendanceTable).where(eq(lessonAttendanceTable.memberId, member.id));
      await tx.delete(eventRegistrationsTable).where(eq(eventRegistrationsTable.memberId, member.id));
      await tx.delete(eventAttendanceTable).where(eq(eventAttendanceTable.memberId, member.id));
      await tx.delete(ministryMembersTable).where(eq(ministryMembersTable.memberId, member.id));
      await tx.delete(eventSchedulesTable).where(eq(eventSchedulesTable.memberId, member.id));

      await tx.update(financeEntriesTable).set({
        memberId: null,
        memberName: "[anonimizado]",
        updatedByUserId: anonymousActor,
        updatedAt: new Date(),
      }).where(eq(financeEntriesTable.memberId, member.id));
      await tx.update(assetsTable).set({ responsibleId: null, responsibleName: "[anonimizado]" })
        .where(eq(assetsTable.responsibleId, member.id));
      await tx.update(planningInitiativesTable).set({ responsibleId: null, responsibleName: "[anonimizado]" })
        .where(eq(planningInitiativesTable.responsibleId, member.id));
      await tx.update(pastoralVisitsTable).set({ notes: null, memberName: "[anonimizado]" })
        .where(eq(pastoralVisitsTable.memberId, member.id));
      await tx.update(pastoralVisitsTable).set({ pastorId: anonymousActor, pastorName: "[anonimizado]" })
        .where(eq(pastoralVisitsTable.pastorId, member.id));

      const counselingCases = await tx.select({ id: counselingCasesTable.id })
        .from(counselingCasesTable).where(eq(counselingCasesTable.memberId, member.id));
      for (const counselingCase of counselingCases) {
        await tx.delete(counselingSessionsTable).where(eq(counselingSessionsTable.caseId, counselingCase.id));
      }
      await tx.update(counselingCasesTable).set({
        topic: "[anonimizado]",
        memberName: "[anonimizado]",
        status: "encerrado",
      }).where(eq(counselingCasesTable.memberId, member.id));
      await tx.update(counselingCasesTable).set({
        counselorId: anonymousActor,
        counselorName: "[anonimizado]",
      }).where(eq(counselingCasesTable.counselorId, member.id));

      await tx.update(coursesTable).set({
        teacherId: anonymousActor,
        teacherName: "[anonimizado]",
        updatedAt: new Date(),
      }).where(eq(coursesTable.teacherId, member.id));
      await tx.update(eventsTable).set({
        responsibleId: null,
        responsibleName: "[anonimizado]",
        updatedAt: new Date(),
      }).where(eq(eventsTable.responsibleId, member.id));

      await tx.update(songSuggestionsTable).set({
        suggestedByMemberId: null,
        suggestedByUserId: null,
        suggestedByName: "[conta excluída]",
        reason: null,
      }).where(eq(songSuggestionsTable.suggestedByMemberId, member.id));
      await tx.update(pixDonationsTable).set({
        memberId: null,
        donorName: "[anonimizado]",
        donorEmail: null,
        notes: null,
      }).where(eq(pixDonationsTable.memberId, member.id));
      await tx.update(visitorsTable).set({
        assignedToMemberId: null,
        assignedToMemberName: null,
        updatedByUserId: anonymousActor,
        updatedAt: new Date(),
      }).where(eq(visitorsTable.assignedToMemberId, member.id));

      await tx.delete(memberHistoryTable).where(eq(memberHistoryTable.memberId, member.id));
      await tx.update(membersTable).set({
        fullName: `Membro Anonimizado #${deletionReference.slice(0, 8)}`,
        cpfEncrypted: null,
        cpfHash: null,
        dateOfBirth: null,
        sex: null,
        phoneEncrypted: null,
        email: null,
        addressZipEncrypted: null,
        addressStreetEncrypted: null,
        addressNumber: null,
        addressComplement: null,
        addressNeighborhoodEncrypted: null,
        addressCity: null,
        addressState: null,
        receptionMode: null,
        receptionDate: null,
        conversionYear: null,
        religiousOrigin: null,
        infantBaptism: false,
        infantBaptismChurch: null,
        infantBaptismPastor: null,
        parentsOrGuardians: null,
        maritalStatus: null,
        spouseMemberId: null,
        externalSpouseName: null,
        academicEducation: null,
        profession: null,
        exclusionReason: null,
        exclusionDate: null,
        exclusionNotes: null,
        exclusionLetterPath: null,
        photoPath: null,
        status: "rol_apartado",
        updatedByUserId: anonymousActor,
        updatedAt: new Date(),
      }).where(eq(membersTable.id, member.id));

      await tx.delete(lgpdRequestsTable).where(or(
        eq(lgpdRequestsTable.userId, account.id),
        eq(lgpdRequestsTable.memberId, member.id),
      ));
    } else {
      await tx.delete(lgpdRequestsTable).where(eq(lgpdRequestsTable.userId, account.id));
    }

    // Remove personal community content while preserving thread integrity.
    await tx.update(forumTopicsTable).set({
      title: "Conteúdo removido",
      body: "[conteúdo removido pelo titular]",
      authorId: anonymousActor,
      authorName: "Conta excluída",
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(forumTopicsTable.authorId, account.id));
    await tx.update(forumRepliesTable).set({
      body: "[conteúdo removido pelo titular]",
      authorId: anonymousActor,
      authorName: "Conta excluída",
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(forumRepliesTable.authorId, account.id));
    await tx.update(lessonDiscussionsTable).set({
      body: "[conteúdo removido pelo titular]",
      authorId: anonymousActor,
      authorName: "Conta excluída",
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(lessonDiscussionsTable.authorId, account.id));

    const authoredArticles = await tx.select({ id: articlesTable.id, status: articlesTable.status })
      .from(articlesTable).where(eq(articlesTable.authorId, account.id));
    for (const article of authoredArticles) {
      const published = article.status === "publicado";
      await tx.update(articlesTable).set({
        ...(published ? {} : {
          title: "Conteúdo removido",
          slug: `conteudo-removido-${article.id.slice(0, 12)}`,
          body: "[conteúdo removido pelo titular]",
          excerpt: null,
          coverImageUrl: null,
          deletedAt: new Date(),
        }),
        authorId: anonymousActor,
        authorName: "Conta excluída",
        updatedAt: new Date(),
      }).where(eq(articlesTable.id, article.id));
    }

    await tx.update(songSuggestionsTable).set({
      suggestedByMemberId: null,
      suggestedByUserId: null,
      suggestedByName: "[conta excluída]",
      reason: null,
    }).where(eq(songSuggestionsTable.suggestedByUserId, account.id));
    await tx.update(contentsTable).set({
      authorName: "Conta excluída",
      updatedByUserId: anonymousActor,
      updatedAt: new Date(),
    }).where(eq(contentsTable.createdByUserId, account.id));
    await tx.update(pixDonationsTable).set({
      donorName: "[anonimizado]",
      donorEmail: null,
      notes: null,
    }).where(eq(pixDonationsTable.donorEmail, account.email));

    await tx.delete(consentRecordsTable).where(eq(consentRecordsTable.userId, account.id));
    await tx.delete(notificationsTable).where(eq(notificationsTable.userId, account.id));
    await tx.update(auditLogsTable).set({
      userId: anonymousActor,
      resourceId: null,
      details: null,
      ipAddress: null,
    }).where(eq(auditLogsTable.userId, account.id));

    const admins = await tx.select({ id: usersTable.id }).from(usersTable).where(and(
      eq(usersTable.role, "admin"),
      eq(usersTable.status, "active"),
      ne(usersTable.id, account.id),
    ));
    if (admins.length) {
      await tx.insert(notificationsTable).values(admins.map(admin => ({
        userId: admin.id,
        type: "account.deleted",
        title: "Conta excluída pelo titular",
        message: `A exclusão automática foi concluída. Referência: ${deletionReference.slice(0, 8)}.`,
        link: "/admin/accounts",
        entityType: "account_deletion",
        entityId: deletionReference,
      })));
    }
    await tx.insert(auditLogsTable).values({
      userId: "system",
      action: "ACCOUNT_SELF_DELETED",
      resourceType: "account_deletion",
      resourceId: deletionReference,
      details: { role: account.role },
    });

    await tx.delete(usersTable).where(eq(usersTable.id, account.id));
    return [...paths];
  });

  const storage = new ObjectStorageService();
  for (const path of filePaths) {
    try {
      await storage.deleteObjectEntityFile(path);
    } catch (error) {
      logger.error({ error, deletionReference }, "Failed to remove personal file after account deletion");
    }
  }

  return { deletionReference };
}
