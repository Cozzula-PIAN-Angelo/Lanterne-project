import { AcceptProposalButton } from "@/components/accept-proposal-button";
import type { ConnectionSummary } from "@/lib/access/connections";
import { formatRevealLabel, ofRevealTime } from "@/lib/time/format";

type Props = { connection: ConnectionSummary; viewerTz: string; now: Date };

export function ConnectionCard({ connection, viewerTz, now }: Props) {
  const { partner, nextArrivalAt, proposedRevealTime, proposedByMe } = connection;
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: partner.color }} />
        <span className="font-medium">{partner.name}</span>
      </div>
      {connection.status === "active" && nextArrivalAt && (
        <p className="text-sm text-muted-foreground">
          Le lanterne arrivano {formatRevealLabel(nextArrivalAt, viewerTz, now)}
        </p>
      )}
      {connection.status === "pending" && proposedRevealTime && (
        <>
          <p className="text-sm text-muted-foreground">In attesa: proposta {ofRevealTime(proposedRevealTime)}</p>
          {!proposedByMe && <AcceptProposalButton connectionId={connection.id} />}
        </>
      )}
    </li>
  );
}
