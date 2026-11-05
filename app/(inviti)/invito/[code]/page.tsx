import Link from "next/link";
import { InviteAcceptForm } from "@/components/invite-accept-form";
import { getInvitePreview } from "@/lib/access/invites";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/messages";
import { atRevealTime } from "@/lib/time/format";

export default async function InviteLandingPage({ params }: PageProps<"/invito/[code]">) {
  const { code } = await params;
  const user = await requireOnboardedUser(`/invito/${encodeURIComponent(code)}`);
  const now = (await getRequestClock()).now();
  const preview = await getInvitePreview(db, { code, viewerId: user.id, now });

  if (!preview.ok) {
    return (
      <section className="space-y-4">
        <p role="alert" className="text-lg">
          {errorMessage(preview.error)}
        </p>
        <Link href="/" className="underline">
          Torna alle tue persone
        </Link>
      </section>
    );
  }

  const { inviterName, proposedRevealTime } = preview.value;
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {inviterName} ti invita: le lanterne arrivano {atRevealTime(proposedRevealTime)}
      </h1>
      <InviteAcceptForm code={code} proposedTime={proposedRevealTime} />
    </section>
  );
}
