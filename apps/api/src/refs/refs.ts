import type { PeopleRefs, Refs, ShiftRef } from "@repo/shared";
import type { Tx } from "../prisma/db.js";
import { toShiftDto, withAgencyName } from "../shifts/shift.mapper.js";

/** The ids a response references. Duplicates and nulls are fine; they are dropped. */
export interface RefIds {
  userIds?: Iterable<string | null | undefined>;
  shiftIds?: Iterable<string | null | undefined>;
}

type RefsClient = Pick<Tx, "user" | "shift">;

function distinct(ids: Iterable<string | null | undefined> = []): string[] {
  const set = new Set<string>();
  for (const id of ids) if (typeof id === "string" && id !== "") set.add(id);
  return [...set];
}

/** Names for user ids: name and role only, never the email. Unknown ids are absent. */
export async function resolvePeople(
  prisma: Pick<Tx, "user">,
  userIds: Iterable<string | null | undefined>,
): Promise<PeopleRefs> {
  const ids = distinct(userIds);
  if (ids.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true },
    orderBy: { id: "asc" },
  });
  return Object.fromEntries(
    users.map((user) => [user.id, { name: user.name, role: user.role }]),
  );
}

/**
 * The `refs` side map of a response: one query for people and one for shifts, only for
 * the ids it references, so every key is an id the response mentions.
 */
export async function resolveRefs(
  prisma: RefsClient,
  { userIds, shiftIds }: RefIds,
): Promise<Refs> {
  const shiftIdList = distinct(shiftIds);
  const [people, shiftRows] = await Promise.all([
    resolvePeople(prisma, userIds ?? []),
    shiftIdList.length === 0
      ? Promise.resolve([])
      : prisma.shift.findMany({
          where: { id: { in: shiftIdList } },
          include: withAgencyName,
          orderBy: { id: "asc" },
        }),
  ]);
  const shifts: Record<string, ShiftRef> = {};
  for (const row of shiftRows) {
    const { agencyId, agencyName, role, date, startTime, endTime } =
      toShiftDto(row);
    shifts[row.id] = { agencyId, agencyName, role, date, startTime, endTime };
  }
  return { people, shifts };
}
