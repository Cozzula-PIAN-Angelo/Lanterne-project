import Link from "next/link";
import { ConnectionCard } from "@/components/connection-card";
import { listClosedWithMemories, listConnections } from "@/lib/access/connections";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { MAX_CONNECTIONS } from "@/lib/lanterns/constants";

export default async function HomePage() {
  const user = await requireOnboardedUser();
  const now = (await getRequestClock()).now();
  const [connections, closed] = await Promise.all([
    listConnections(db, { userId: user.id, now }),
    listClosedWithMemories(db, { userId: user.id, now }),
  ]);
  const freeSlots = Math.max(0, MAX_CONNECTIONS - connections.length);

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Le tue persone</h1>
        <Link href="/impostazioni" className="text-sm underline underline-offset-4">
          Impostazioni
        </Link>
      </header>
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

      {closed.length > 0 && (
        <section aria-label="Connessioni chiuse" className="space-y-2 pt-4">
          <h2 className="text-lg font-medium">Connessioni chiuse</h2>
          <p className="text-sm text-muted-foreground">Qui ritrovi i ricordi che hai conservato.</p>
          <ul className="space-y-1">
            {closed.map((connection) => (
              <li key={connection.id}>
                <Link href={`/persone/${connection.id}`} className="underline underline-offset-4">
                  {connection.partner.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
