import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Db, DbOrTx } from "@/lib/db/client";
import { connections, invites, user } from "@/lib/db/schema";
import { INVITE_TTL_DAYS, MAX_CONNECTIONS, RATE_LIMITS } from "@/lib/lanterns/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedRevealTime } from "@/lib/time/reveal-time";
import { isBlockedEitherWay } from "./blocks";
import { countOpenConnections, lockUsers } from "./connections";
import { fail, ok, type AccessResult } from "./errors";
import { isOnboarded } from "./profile";

const DAY_MS = 24 * 60 * 60 * 1000;

async function findUser(db: DbOrTx, id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row;
}

async function hasOpenConnection(db: DbOrTx, a: string, b: string): Promise<boolean> {
  const [userAId, userBId] = [a, b].sort();
  const rows = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.userAId, userAId),
        eq(connections.userBId, userBId),
        ne(connections.status, "ended"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function createInvite(
  db: Db,
  input: { userId: string; proposedRevealTime: string; now: Date },
): Promise<AccessResult<{ code: string; expiresAt: Date }>> {
  const { userId, proposedRevealTime, now } = input;

  const limited = await checkRateLimit(db, {
    key: `invite-create:${userId}`,
    ...RATE_LIMITS.inviteCreate,
    now,
  });
  if (!limited.ok) return fail("rate_limited");

  const inviter = await findUser(db, userId);
  if (!inviter || !isOnboarded(inviter)) return fail("onboarding_required");
  if (!isAllowedRevealTime(proposedRevealTime)) return fail("invalid_reveal_time");
  if ((await countOpenConnections(db, userId)) >= MAX_CONNECTIONS) {
    return fail("connection_limit_self");
  }

  const code = randomBytes(16).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
  await db.insert(invites).values({ inviterId: userId, code, proposedRevealTime, expiresAt });
  return ok({ code, expiresAt });
}

/** Anteprima mostrata a chi apre il link: stessi controlli dell'accettazione sull'invito. */
export async function getInvitePreview(
  db: Db,
  input: { code: string; viewerId: string; now: Date },
): Promise<AccessResult<{ inviterName: string; proposedRevealTime: string; expiresAt: Date }>> {
  const { code, viewerId, now } = input;
  const [row] = await db
    .select({ invite: invites, inviterName: user.name })
    .from(invites)
    .innerJoin(user, eq(user.id, invites.inviterId))
    .where(eq(invites.code, code));
  if (!row) return fail("invite_invalid");

  const { invite } = row;
  if (invite.inviterId === viewerId) return fail("self_invite");
  if (await isBlockedEitherWay(db, invite.inviterId, viewerId)) return fail("invite_invalid");
  if (invite.acceptedAt) return fail("invite_used");
  if (invite.expiresAt.getTime() <= now.getTime()) return fail("invite_expired");

  return ok({
    inviterName: row.inviterName,
    proposedRevealTime: invite.proposedRevealTime,
    expiresAt: invite.expiresAt,
  });
}

export async function acceptInvite(
  db: Db,
  input: { code: string; userId: string; counterProposal?: string; now: Date },
): Promise<AccessResult<{ connectionId: string; status: "active" | "pending" }>> {
  const { code, userId, counterProposal, now } = input;

  return db.transaction(async (tx) => {
    // 1. rate limit
    const limited = await checkRateLimit(tx, {
      key: `invite-accept:${userId}`,
      ...RATE_LIMITS.inviteAccept,
      now,
    });
    if (!limited.ok) return fail("rate_limited");

    // 2. invito inesistente (bloccato per la durata della transazione)
    const [invite] = await tx.select().from(invites).where(eq(invites.code, code)).for("update");
    if (!invite) return fail("invite_invalid");

    // Serializza con le altre operazioni sugli stessi due utenti (limite di 5, inviti incrociati).
    await lockUsers(tx, [invite.inviterId, userId]);

    // 3. onboarding
    const invitee = await findUser(tx, userId);
    if (!invitee || !isOnboarded(invitee)) return fail("onboarding_required");

    // 4-7
    if (invite.inviterId === userId) return fail("self_invite");
    if (await isBlockedEitherWay(tx, invite.inviterId, userId)) return fail("invite_invalid");
    if (invite.acceptedAt) return fail("invite_used");
    if (invite.expiresAt.getTime() <= now.getTime()) return fail("invite_expired");

    // 8-9
    if (await hasOpenConnection(tx, invite.inviterId, userId)) return fail("already_connected");
    if ((await countOpenConnections(tx, userId)) >= MAX_CONNECTIONS) {
      return fail("connection_limit_self");
    }
    if ((await countOpenConnections(tx, invite.inviterId)) >= MAX_CONNECTIONS) {
      return fail("connection_limit_other");
    }

    // 10. controproposta
    if (counterProposal !== undefined && !isAllowedRevealTime(counterProposal)) {
      return fail("invalid_reveal_time");
    }

    const [userAId, userBId] = [invite.inviterId, userId].sort();
    const values =
      counterProposal === undefined
        ? { status: "active" as const, revealTime: invite.proposedRevealTime }
        : {
            status: "pending" as const,
            revealTime: null,
            proposedRevealTime: counterProposal,
            proposedBy: userId,
            proposedAt: now,
          };
    const [connection] = await tx
      .insert(connections)
      .values({ userAId, userBId, ...values })
      .returning({ id: connections.id });

    await tx
      .update(invites)
      .set({ acceptedAt: now, acceptedBy: userId })
      .where(eq(invites.id, invite.id));

    return ok({ connectionId: connection.id, status: values.status });
  });
}
