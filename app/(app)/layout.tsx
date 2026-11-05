import { Suspense } from "react";
import { TimezoneBanner } from "@/components/timezone-banner";
import { isOnboarded } from "@/lib/access/profile";
import { requireUser } from "@/lib/auth/session";

// La sessione è un dato di richiesta: con Cache Components va letta dentro un <Suspense>.
async function SignedIn({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      {isOnboarded({ color: user.color ?? null }) && <TimezoneBanner userTz={user.timezone ?? "UTC"} />}
      {children}
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
