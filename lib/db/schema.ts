import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const userRef = (name: string) =>
  text(name)
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const instant = (name: string) => timestamp(name, { withTimezone: true });

export const connectionStatus = pgEnum("connection_status", ["pending", "active", "ended"]);
export const lanternType = pgEnum("lantern_type", ["audio", "photo", "text", "thought"]);
export const lanternStatus = pgEnum("lantern_status", ["uploading", "ready"]);

export const connections = pgTable(
  "connections",
  {
    id: id(),
    // Normalizzazione: userAId < userBId (confronto tra stringhe).
    userAId: userRef("user_a_id"),
    userBId: userRef("user_b_id"),
    status: connectionStatus("status").notNull(),
    revealTime: text("reveal_time"),
    previousRevealTime: text("previous_reveal_time"),
    revealTimeChangedAt: instant("reveal_time_changed_at"),
    proposedRevealTime: text("proposed_reveal_time"),
    proposedBy: text("proposed_by").references(() => user.id, { onDelete: "cascade" }),
    proposedAt: instant("proposed_at"),
    createdAt: instant("created_at").notNull().defaultNow(),
    /** Quando la connessione è diventata active (orario concordato). */
    activatedAt: instant("activated_at"),
    endedAt: instant("ended_at"),
  },
  (t) => [
    index("connections_user_b").on(t.userBId),
    // COLLATE "C": stesso ordine di Array.sort() in JS, qualunque sia la collation del DB.
    check("connections_user_order", sql`${t.userAId} COLLATE "C" < ${t.userBId} COLLATE "C"`),
    uniqueIndex("connections_open_pair")
      .on(t.userAId, t.userBId)
      .where(sql`${t.status} <> 'ended'`),
  ],
);

export const invites = pgTable(
  "invites",
  {
  id: id(),
  inviterId: userRef("inviter_id"),
  code: text("code").notNull().unique(),
  proposedRevealTime: text("proposed_reveal_time").notNull(),
  expiresAt: instant("expires_at").notNull(),
  acceptedAt: instant("accepted_at"),
  acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "cascade" }),
  createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [index("invites_inviter").on(t.inviterId)],
);

export const lanterns = pgTable(
  "lanterns",
  {
    id: id(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    senderId: userRef("sender_id"),
    recipientId: userRef("recipient_id"),
    type: lanternType("type").notNull(),
    text: text("text"),
    mediaKey: text("media_key"),
    mediaMime: text("media_mime"),
    mediaBytes: integer("media_bytes"),
    durationSec: integer("duration_sec"),
    status: lanternStatus("status").notNull(),
    revealAt: instant("reveal_at").notNull(),
    expiresAt: instant("expires_at").notNull(),
    savable: boolean("savable").notNull(),
    savedAt: instant("saved_at"),
    reaction: text("reaction"),
    reactedAt: instant("reacted_at"),
    notifiedAt: instant("notified_at"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("lanterns_recipient_reveal").on(t.recipientId, t.revealAt),
    index("lanterns_connection_created").on(t.connectionId, t.createdAt),
    index("lanterns_sender").on(t.senderId),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: userRef("blocker_id"),
    blockedId: userRef("blocked_id"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/** File da togliere dallo storage: la scrive un trigger su `lanterns`, la svuota il worker. */
export const storageDeletions = pgTable("storage_deletions", {
  key: text("key").primaryKey(),
  createdAt: instant("created_at").notNull().defaultNow(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: userRef("user_id"),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: instant("window_start").notNull(),
  count: integer("count").notNull(),
});
