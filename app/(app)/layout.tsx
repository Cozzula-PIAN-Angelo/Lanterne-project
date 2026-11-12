import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Suspense } from "react";
import { DevTimePanel } from "@/components/dev-time-panel";
import { OutboxPanel } from "@/components/outbox-panel";
import { TimezoneBanner } from "@/components/timezone-banner";
import { isOnboarded } from "@/lib/access/profile";
import { requireUser } from "@/lib/auth/session";
import { getDevOffsetMs, getRequestClock } from "@/lib/clock/request";
import { nextOccurrence } from "@/lib/time/reveal-time";

async function DevTime({ timezone }: { timezone: string }) {
  const [offsetMs, clock] = await Promise.all([getDevOffsetMs(), getRequestClock()]);
  const now = clock.now();
  const morning = nextOccurrence("08:00", timezone, now);
  return (
    <DevTimePanel
      offsetMs={offsetMs}
      morningOffsetMs={morning.getTime() - (now.getTime() - offsetMs)}
      nowLabel={format(new TZDate(now.getTime(), timezone), "EEE d MMM, H:mm", { locale: it })}
    />
  );
}

// La sessione è un dato di richiesta: con Cache Components va letta dentro un <Suspense>.
async function SignedIn({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const timezone = user.timezone ?? "UTC";
  return (
    <>
      {isOnboarded({ color: user.color ?? null }) && (
        <>
          <TimezoneBanner userTz={timezone} />
          <OutboxPanel userId={user.id} />
        </>
      )}
      {children}
      {process.env.NODE_ENV === "development" && <DevTime timezone={timezone} />}
    </>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <Suspense fallback={<p className="text-muted-foreground">Un attimo…</p>}>
        <SignedIn>{children}</SignedIn>
      </Suspense>
    </main>
  );
}
