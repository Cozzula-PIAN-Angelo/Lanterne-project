import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemoryLantern } from "@/components/lantern-item";
import { getMemories } from "@/lib/access/lanterns";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";

/** "2026-11-02" in lettere ("2 novembre"). Il mezzogiorno nel fuso di chi guarda evita scarti di giorno. */
function eveningLabel(date: string, tz: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return format(new TZDate(year, month - 1, day, 12, 0, tz), "d MMMM", { locale: it });
}

export default async function MemoriesPage({ params }: PageProps<"/persone/[id]/ricordi">) {
  const { id: connectionId } = await params;
  const user = await requireOnboardedUser();
  const now = (await getRequestClock()).now();
  const memories = await getMemories(db, { connectionId, userId: user.id, now });
  if (!memories.ok) notFound();

  const { partner, status, evenings } = memories.value;
  const viewerTz = user.timezone ?? "UTC";

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        {status === "ended" ? (
          <Link href="/" className="text-sm underline underline-offset-4">
            Le tue persone
          </Link>
        ) : (
          <Link href={`/persone/${connectionId}`} className="text-sm underline underline-offset-4">
            {partner.name}
          </Link>
        )}
        <h1 className="text-2xl font-semibold">Ricordi con {partner.name}</h1>
      </header>

      {status === "ended" && <p>Questa connessione è chiusa.</p>}

      {evenings.length === 0 && <p className="text-muted-foreground">Qui finiscono le lanterne che conservi.</p>}

      {evenings.map((evening) => {
        const title = eveningLabel(evening.date, viewerTz);
        return (
          <section key={evening.date} aria-label={title} className="space-y-3">
            <h2 className="text-lg font-medium">{title}</h2>
            <ul className="space-y-3">
              {evening.lanterns.map((lantern) => (
                <MemoryLantern key={lantern.id} lantern={lantern} viewerTz={viewerTz} senderName={partner.name} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
