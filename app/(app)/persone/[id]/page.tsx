import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConnectionMenu } from "@/components/connection-menu";
import { DevArriveNow } from "@/components/dev-arrive-now";
import { Countdown } from "@/components/countdown";
import { LanternComposer } from "@/components/lantern-composer";
import { LakeScene } from "@/components/lake/lake-scene";
import { getChannel } from "@/lib/access/lanterns";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/messages";
import { formatDepartureLabel } from "@/lib/time/format";

export default async function ChannelPage({ params }: PageProps<"/persone/[id]">) {
  const { id: connectionId } = await params;
  const user = await requireOnboardedUser();
  const now = (await getRequestClock()).now();
  const channel = await getChannel(db, { connectionId, userId: user.id, now });
  if (!channel.ok) notFound();

  const { connection, sent, arrived, memories, partnerLeftNothing, nextDepartureAt, lastArrivalAt } = channel.value;
  const { partner, status } = connection;
  // Una connessione chiusa ha solo i ricordi.
  if (status === "ended") redirect(`/persone/${connectionId}/ricordi`);
  const viewerTz = user.timezone ?? "UTC";
  const nextDeparture = sent
    .filter((l) => l.sealed)
    .map((l) => l.revealAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/" className="text-sm underline underline-offset-4">
          Le tue persone
        </Link>
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: partner.color }} />
          <h1 className="text-2xl font-semibold">{partner.name}</h1>
        </div>
      </header>

      <LakeScene
        serverNow={now.toISOString()}
        tz={viewerTz}
        lastArrivalAt={lastArrivalAt?.toISOString() ?? null}
        nextArrivalAt={connection.nextArrivalAt?.toISOString() ?? null}
        me={{ name: user.name, color: user.color ?? "" }}
        partner={{ name: partner.name, color: partner.color }}
        sent={sent}
        arrived={arrived}
        partnerLeftNothing={partnerLeftNothing}
        connectionId={connectionId}
      />

      {nextDeparture && (
        <div>
          <p className="text-sm">
            {formatDepartureLabel(nextDeparture, viewerTz, partner.timezone, partner.name, now)}
          </p>
          {/* La key lo rimonta a ogni nuovo orario del server, anche dopo un viaggio nel tempo. */}
          <Countdown key={now.toISOString()} target={nextDeparture.toISOString()} serverNow={now.toISOString()} />
        </div>
      )}

      {status === "active" && nextDepartureAt && (
        <LanternComposer
          userId={user.id}
          connectionId={connectionId}
          expectedRevealAt={nextDepartureAt.toISOString()}
          partnerName={partner.name}
        />
      )}
      {status === "pending" && <p>{errorMessage("connection_not_active")}</p>}

      {process.env.NODE_ENV === "development" && status === "active" && (
        <DevArriveNow connectionId={connectionId} />
      )}

      {memories.length > 0 && (
        <Link href={`/persone/${connectionId}/ricordi`} className="block text-sm underline underline-offset-4">
          Ricordi ({memories.length})
        </Link>
      )}

      <ConnectionMenu
          connectionId={connectionId}
          partnerName={partner.name}
          status={status}
          revealTime={connection.revealTime}
          proposedRevealTime={connection.proposedRevealTime}
          proposedByMe={connection.proposedByMe}
        />
    </div>
  );
}
