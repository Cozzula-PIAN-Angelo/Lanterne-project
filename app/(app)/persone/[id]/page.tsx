import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { LanternComposer } from "@/components/lantern-composer";
import { ArrivedLantern, MemoryLantern, SentLantern } from "@/components/lantern-item";
import { getChannel } from "@/lib/access/lanterns";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/messages";
import { formatDepartureLabel } from "@/lib/time/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default async function ChannelPage({ params }: PageProps<"/persone/[id]">) {
  const { id: connectionId } = await params;
  const user = await requireOnboardedUser();
  const now = (await getRequestClock()).now();
  const channel = await getChannel(db, { connectionId, userId: user.id, now });
  if (!channel.ok) notFound();

  const { connection, sent, arrived, memories, partnerLeftNothing } = channel.value;
  const { partner, status } = connection;
  const viewerTz = user.timezone ?? "UTC";
  const nextDeparture = sent
    .filter((l) => l.sealed)
    .map((l) => l.revealAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-2">
        <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: partner.color }} />
        <h1 className="text-2xl font-semibold">{partner.name}</h1>
      </header>

      {status === "ended" && <p>Questa connessione è chiusa.</p>}

      {status !== "ended" && arrived.length > 0 && (
        <Section title="Arrivate">
          <ul className="space-y-3">
            {arrived.map((lantern) => (
              <ArrivedLantern key={lantern.id} lantern={lantern} connectionId={connectionId} viewerTz={viewerTz} />
            ))}
          </ul>
        </Section>
      )}

      {status !== "ended" && partnerLeftNothing && (
        <p>Stasera l&apos;acqua è tranquilla: {partner.name} non ha lasciato lanterne.</p>
      )}

      {status !== "ended" && sent.length > 0 && (
        <Section title="Le tue lanterne">
          {nextDeparture && (
            <div>
              <p className="text-sm">
                {formatDepartureLabel(nextDeparture, viewerTz, partner.timezone, partner.name, now)}
              </p>
              <Countdown target={nextDeparture.toISOString()} serverNow={now.toISOString()} />
            </div>
          )}
          <ul className="space-y-3">
            {sent.map((lantern) => (
              <SentLantern
                key={lantern.id}
                lantern={lantern}
                connectionId={connectionId}
                viewerTz={viewerTz}
                partnerName={partner.name}
              />
            ))}
          </ul>
        </Section>
      )}

      {status === "active" && <LanternComposer connectionId={connectionId} />}
      {status === "pending" && <p>{errorMessage("connection_not_active")}</p>}

      {memories.length > 0 && (
        <Section title="Ricordi">
          <ul className="space-y-3">
            {memories.map((lantern) => (
              <MemoryLantern key={lantern.id} lantern={lantern} viewerTz={viewerTz} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
