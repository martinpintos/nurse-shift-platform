import type { Prisma } from "../generated/prisma/client.js";

/**
 * What data helpers take: the client inside `$transaction(async (tx) => ...)`. Writes that
 * must commit together with a state change (audit entries, outbox messages) take this, so
 * they can't accidentally run outside the change's transaction.
 */
export type Tx = Prisma.TransactionClient;
