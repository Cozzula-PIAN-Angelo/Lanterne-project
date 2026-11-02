import { SignInForm } from "@/components/auth/sign-in-form";
import { isDemoLoginEnabled } from "@/lib/auth/demo";

export default function SignInPage() {
  const demo = isDemoLoginEnabled(process.env);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Lanterne</h1>
        <p className="text-muted-foreground">Entra con la tua email: ti mandiamo un link.</p>
      </header>
      <SignInForm demo={demo} />
    </main>
  );
}
