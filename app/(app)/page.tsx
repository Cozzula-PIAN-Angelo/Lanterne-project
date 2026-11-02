import { requireOnboardedUser } from "@/lib/auth/session";

// Versione minima: la home vera arriva nel Task 12.
export default async function HomePage() {
  const user = await requireOnboardedUser();
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Le tue persone</h1>
      <p className="text-muted-foreground">Ciao {user.name}.</p>
    </section>
  );
}
