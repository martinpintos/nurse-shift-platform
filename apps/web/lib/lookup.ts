import type { PeopleRefs, Refs, Shift, ShiftRef } from "@repo/shared";

/**
 * Resolves ids to what people read: names from the API's `refs` (or the agency's people
 * lookup), and shift summaries from refs or from shifts already loaded. Anything unknown
 * falls back to its id, which is still correct, only less friendly.
 */
export interface Lookup {
  /** A person's display name, or their id when no name is known. */
  name: (id: string) => string;
  /** Whether a name (not just the id) is known for this person. */
  knows: (id: string) => boolean;
  /** What a sentence needs about a shift, when known. */
  shift: (id: string) => ShiftRef | undefined;
}

export function createLookup({
  refs,
  people,
  shifts = [],
  self,
}: {
  refs?: Refs;
  people?: PeopleRefs;
  shifts?: readonly Shift[];
  self?: { id: string; name: string };
}): Lookup {
  const names = new Map<string, string>();
  for (const [id, person] of Object.entries(refs?.people ?? {})) {
    names.set(id, person.name);
  }
  for (const [id, person] of Object.entries(people ?? {})) {
    names.set(id, person.name);
  }
  if (self) names.set(self.id, self.name);

  const shiftRefs = new Map<string, ShiftRef>(
    Object.entries(refs?.shifts ?? {}),
  );
  for (const shift of shifts) {
    shiftRefs.set(shift.id, {
      agencyId: shift.agencyId,
      agencyName: shift.agencyName,
      role: shift.role,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
    });
  }

  return {
    name: (id) => names.get(id) ?? id,
    knows: (id) => names.has(id),
    shift: (id) => shiftRefs.get(id),
  };
}
