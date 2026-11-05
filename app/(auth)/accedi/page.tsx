import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { isDemoLoginEnabled } from "@/lib/auth/demo";
import { safeNextPath } from "@/lib/auth/next-path";

// I parametri dell'URL sono un dato di richiesta: con Cache Components vanno letti dentro un <Suspense>.
async function SignIn({ searchParams }: Pick<PageProps<"/accedi">, "searchParams">) {
  const next = safeNextPath((await searchParams).next) ?? "/";
  return <SignInForm demo={isDemoLoginEnabled(process.env)} next={next} />;
}

export default function SignInPage({ searchParams }: PageProps<"/accedi">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Lanterne</h1>
        <p className="text-muted-foreground">Entra con la tua email: ti mandiamo un link.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Un attimo…</p>}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
