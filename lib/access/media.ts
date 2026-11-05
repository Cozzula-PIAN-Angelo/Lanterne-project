import { randomUUID } from "node:crypto";
import { and, eq, gt, gte, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { lanterns } from "@/lib/db/schema";
import { RATE_LIMITS } from "@/lib/lanterns/constants";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_SEC,
  AUDIO_MIMES,
  DAILY_AUDIO_SEC,
  PHOTO_MAX_BYTES,
  PHOTO_MIMES,
  baseMime,
} from "@/lib/lanterns/media";
import { checkRateLimit } from "@/lib/rate-limit";
import type { MediaStorage } from "@/lib/storage/s3";
import { computeExpiresAt, computeRevealAt } from "@/lib/time/lantern-times";
import { localDateOf, localInstant } from "@/lib/time/reveal-time";
import { fail, ok, type AccessResult } from "./errors";
import { findVisibleForRecipient, openConnectionForSender } from "./lanterns";

/** Un URL firmato dura 5 minuti: oltre, un upload "uploading" non può più concludersi. */
const UPLOAD_WINDOW_MS = 5 * 60 * 1000;

export type MediaInput = {
  connectionId: string;
  senderId: string;
  type: "audio" | "photo";
  mime: string;
  bytes: number;
  durationSec?: number;
  now: Date;
};

function isValidMedia({ type, mime, bytes, durationSec }: MediaInput): boolean {
  if (!Number.isInteger(bytes) || bytes < 1) return false;
  const base = baseMime(mime);
  if (type === "photo") {
    return (PHOTO_MIMES as readonly string[]).includes(base) && bytes <= PHOTO_MAX_BYTES;
  }
  return (
    (AUDIO_MIMES as readonly string[]).includes(base) &&
    bytes <= AUDIO_MAX_BYTES &&
    durationSec !== undefined &&
    Number.isInteger(durationSec) &&
    durationSec >= 1 &&
    durationSec <= AUDIO_MAX_SEC
  );
}

export async function createMediaLantern(
  db: Db,
  storage: MediaStorage,
  input: MediaInput,
): Promise<AccessResult<{ lanternId: string; uploadUrl: string; uploadHeaders: Record<string, string>; revealAt: Date }>> {
  const { connectionId, senderId, type, bytes, durationSec, now } = input;
  const limited = await checkRateLimit(db, { key: `upload:${senderId}`, ...RATE_LIMITS.upload, now });
  if (!limited.ok) return fail("rate_limited");
  if (!isValidMedia(input)) return fail("invalid_input");
  const mime = baseMime(input.mime);

  const created = await db.transaction(async (tx) => {
    const opened = await openConnectionForSender(tx, connectionId, senderId);
    if (!opened.ok) return opened;
    const { connection, sender, recipient } = opened.value;

    if (type === "audio") {
      const senderTz = sender.timezone ?? "UTC";
      const dayStart = localInstant(localDateOf(now, senderTz), "00:00", senderTz);
      const uploadOpenSince = new Date(now.getTime() - UPLOAD_WINDOW_MS);
      const [{ used }] = await tx
        .select({ used: sql<number>`coalesce(sum(${lanterns.durationSec}), 0)::int` })
        .from(lanterns)
        .where(
          and(
            eq(lanterns.connectionId, connectionId),
            eq(lanterns.senderId, senderId),
            eq(lanterns.type, "audio"),
            gte(lanterns.createdAt, dayStart),
            or(eq(lanterns.status, "ready"), gt(lanterns.createdAt, uploadOpenSince)),
          ),
        );
      if (used + (durationSec ?? 0) > DAILY_AUDIO_SEC) return fail("audio_cap_reached");
    }

    const recipientTz = recipient.timezone ?? "UTC";
    const revealAt = computeRevealAt(
      {
        revealTime: connection.revealTime,
        previousRevealTime: connection.previousRevealTime,
        revealTimeChangedAt: connection.revealTimeChangedAt,
      },
      recipientTz,
      now,
    );
    const mediaKey = `media/${randomUUID()}`;
    const [row] = await tx
      .insert(lanterns)
      .values({
        connectionId,
        senderId,
        recipientId: recipient.id,
        type,
        mediaKey,
        mediaMime: mime,
        mediaBytes: bytes,
        durationSec: type === "audio" ? durationSec : null,
        status: "uploading",
        revealAt,
        expiresAt: computeExpiresAt(revealAt, recipientTz),
        savable: sender.allowSaving ?? true,
        createdAt: now,
      })
      .returning({ id: lanterns.id });
    return ok({ lanternId: row.id, mediaKey, revealAt });
  });
  if (!created.ok) return created;

  const { lanternId, mediaKey, revealAt } = created.value;
  const { url, headers } = await storage.signUpload({ key: mediaKey, mime, bytes });
  return ok({ lanternId, uploadUrl: url, uploadHeaders: headers, revealAt });
}

export async function confirmMediaLantern(
  db: Db,
  storage: MediaStorage,
  input: { lanternId: string; userId: string },
): Promise<AccessResult<void>> {
  const [row] = await db
    .select()
    .from(lanterns)
    .where(and(eq(lanterns.id, input.lanternId), eq(lanterns.senderId, input.userId)));
  if (!row || !row.mediaKey) return fail("not_found");
  if (row.status === "ready") return ok(undefined);

  const stored = await storage.stat(row.mediaKey);
  if (!stored) return fail("upload_missing");
  if (stored.bytes !== row.mediaBytes || stored.mime !== row.mediaMime) {
    await db.delete(lanterns).where(eq(lanterns.id, row.id));
    return fail("upload_invalid");
  }
  await db.update(lanterns).set({ status: "ready" }).where(eq(lanterns.id, row.id));
  return ok(undefined);
}

export async function getMediaUrl(
  db: Db,
  storage: MediaStorage,
  input: { lanternId: string; userId: string; now: Date },
): Promise<AccessResult<{ url: string; mime: string }>> {
  const { lanternId, userId, now } = input;
  const received = await findVisibleForRecipient(db, lanternId, userId, now);
  const [sent] = received
    ? [undefined]
    : await db
        .select()
        .from(lanterns)
        .where(
          and(
            eq(lanterns.id, lanternId),
            eq(lanterns.senderId, userId),
            eq(lanterns.status, "ready"),
            gt(lanterns.expiresAt, now),
          ),
        );
  const row = received ?? sent;
  if (!row?.mediaKey || !row.mediaMime) return fail("not_found");
  return ok({ url: await storage.signRead(row.mediaKey), mime: row.mediaMime });
}
