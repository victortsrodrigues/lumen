import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Only the explicit account link establishes identity. Email is not authority. */
export async function findLinkedMember(user: { memberId?: string | null }) {
  if (!user.memberId) return undefined;
  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, user.memberId))
    .limit(1);
  return member;
}
