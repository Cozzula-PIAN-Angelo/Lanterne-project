import Link from "next/link";
import { ConnectionCard } from "@/components/connection-card";
import { listConnections } from "@/lib/access/connections";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { MAX_CONNECTIONS } from "@/lib/lanterns/constants";

export default async function HomePage() {
  const user = await requireOnboardedUser();
  const now = (await getRequestClock()).now();
  const connections = await listConnections(db, { userId: user.id, now });
  const freeSlots = Math.max(0, MAX_CONNECTIONS - connections.length);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Le tue persone</h1>
      <ul className="space-y-3">
        {connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            viewerTz={user.timezone ?? "UTC"}
            now={now}
          />
        ))}
        {Array.from({ length: freeSlots }, (_, slot) => (
          <li key={slot}>
            <Link
              href="/invita"
              className="block rounded-xl border border-dashed p-4 text-center text-muted-foreground"
            >
              Invita qualcuno
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
