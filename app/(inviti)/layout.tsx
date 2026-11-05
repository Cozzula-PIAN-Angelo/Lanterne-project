import { Suspense } from "react";

// Fuori da (app): il controllo di quel layout manda a /accedi senza sapere da quale pagina arrivi.
// Qui è la pagina a controllare la sessione, così dopo il login si torna all'invito.
export default function InvitesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <Suspense fallback={<p className="text-muted-foreground">Un attimo…</p>}>{children}</Suspense>
    </main>
  );
}
