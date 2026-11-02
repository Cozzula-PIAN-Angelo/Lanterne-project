import { ProfileForm } from "@/components/profile/profile-form";
import { requireUser } from "@/lib/auth/session";

export default async function WelcomePage() {
  const user = await requireUser();
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Benvenuto</h1>
        <p className="text-muted-foreground">Come ti chiami, e di che colore è la tua lanterna?</p>
      </header>
      <ProfileForm defaultName={user.name === user.email ? "" : user.name} defaultColor={user.color ?? null} />
    </section>
  );
}
