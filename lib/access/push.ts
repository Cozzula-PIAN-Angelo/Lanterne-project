import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { connections, lanterns, pushSubscriptions, user } from "@/lib/db/schema";
import { fail, ok, type AccessResult } from "./errors";

export type PushMessage = { title: string; body: string; url: string };
export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };
export type PushSender = (sub: PushSubscriptionRow, message: PushMessage) => Promise<"sent" | "gone" | "failed">;

const ENDPOINT_MAX = 2048;
const KEY_MAX = 512;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Il worker manderà richieste a questo indirizzo, scelto dal client: niente che non sia HTTPS,
 * e niente indirizzi interni. I servizi push veri hanno sempre un nome di dominio.
 * `URL` normalizza già le altre scritture degli IP, come 2130706433 per 127.0.0.1.
 */
function isAllowedEndpoint(endpoint: string): boolean {
  if (endpoint.length > ENDPOINT_MAX || !URL.canParse(endpoint)) return false;
  const { protocol, hostname: raw } = new URL(endpoint);
  if (protocol !== "https:") return false;
  // "localhost." e "localhost" sono lo stesso nome per il DNS.
  const hostname = raw.replace(/\.+$/, "");
  const internal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.startsWith("[") ||
    IPV4.test(hostname);
  return !internal;
}

const isValidKey = (key: string) => key.length <= KEY_MAX && BASE64URL.test(key);

export async function savePushSubscription(
  db: Db,
  input: PushSubscriptionRow & { userId: string },
): Promise<AccessResult<void>> {
  const { userId, endpoint, p256dh, auth } = input;
  if (!isAllowedEndpoint(endpoint) || !isValidKey(p256dh) || !isValidKey(auth)) return fail("invalid_input");
  // Lo stesso browser può passare a un altro account: l'endpoint segue chi l'ha registrato per ultimo.
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh, auth } });
  return ok(undefined);
}

export async function removePushSubscription(
  db: Db,
  input: { userId: string; endpoint: string },
): Promise<AccessResult<void>> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, input.endpoint), eq(pushSubscriptions.userId, input.userId)))
    .returning({ id: pushSubscriptions.id });
  return removed.length > 0 ? ok(undefined) : fail("not_found");
}

/**
 * Prima marca, con un solo UPDATE, poi invia: due esecuzioni simultanee non si dividono mai la stessa
 * riga. Se il worker cade tra i due passi quelle notifiche si perdono, ma le lanterne restano visibili:
 * meglio di un doppione, e il lago mostra comunque l'arrivo.
 */
export async function notifyArrivals(
  db: Db,
  input: { now: Date; send: PushSender },
): Promise<{ groups: number; failed: number }> {
  const marked = await db
    .update(lanterns)
    .set({ notifiedAt: input.now })
    .where(
      and(
        eq(lanterns.status, "ready"),
        lte(lanterns.revealAt, input.now),
        gt(lanterns.expiresAt, input.now),
        isNull(lanterns.notifiedAt),
      ),
    )
    .returning({
      recipientId: lanterns.recipientId,
      senderId: lanterns.senderId,
      connectionId: lanterns.connectionId,
    });
  if (marked.length === 0) return { groups: 0, failed: 0 };

  // Una connessione ha due sole persone: destinatario e connessione identificano anche il mittente.
  const byConnectionAndRecipient = new Map(marked.map((row) => [`${row.connectionId}:${row.recipientId}`, row]));
  const active = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        inArray(connections.id, marked.map((row) => row.connectionId)),
        eq(connections.status, "active"),
      ),
    );
  const activeIds = new Set(active.map((row) => row.id));
  // Una lanterna conservata sopravvive alla chiusura: l'altra persona non deve più farsi sentire.
  const groups = [...byConnectionAndRecipient.values()].filter((row) => activeIds.has(row.connectionId));
  if (groups.length === 0) return { groups: 0, failed: 0 };

  const senders = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, groups.map((group) => group.senderId)));
  const nameOf = new Map(senders.map((sender) => [sender.id, sender.name]));
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, groups.map((group) => group.recipientId)));

  let failed = 0;
  for (const group of groups) {
    const message: PushMessage = {
      title: "Lanterne",
      body: `Le lanterne di ${nameOf.get(group.senderId)} sono arrivate`,
      url: `/persone/${group.connectionId}`,
    };
    for (const subscription of subscriptions.filter((sub) => sub.userId === group.recipientId)) {
      const outcome = await input.send(subscription, message);
      if (outcome === "failed") failed++;
      if (outcome === "gone") {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));
      }
    }
  }
  return { groups: groups.length, failed };
}
