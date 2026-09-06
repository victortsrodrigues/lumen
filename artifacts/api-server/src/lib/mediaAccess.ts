import { db, councilMeetingsTable, mediaLinksTable } from "@workspace/db";
import { and, eq, isNull, ne, notExists } from "drizzle-orm";

// Council routes are administrator-only. Apply the same rule to media before
// listing/counting/paginating or modifying it, not just to the Council screen.
export function mediaAccessCondition(role: string) {
  return and(
    isNull(mediaLinksTable.deletedAt),
    role === "admin"
      ? undefined
      : and(
          ne(mediaLinksTable.entityType, "council_meeting"),
          // Legacy minutes may have another entity type. Soft-deleting the meeting
          // must not make its document visible to members or leaders either.
          notExists(
            db
              .select({ id: councilMeetingsTable.id })
              .from(councilMeetingsTable)
              .where(eq(councilMeetingsTable.ataMediaId, mediaLinksTable.id)),
          ),
        ),
  )!;
}
