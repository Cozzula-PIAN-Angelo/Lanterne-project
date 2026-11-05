import { CopyLink } from "@/components/copy-link";
import { InviteCreateForm } from "@/components/invite-create-form";
import { requireOnboardedUser } from "@/lib/auth/session";
import { INVITE_TTL_DAYS } from "@/lib/lanterns/constants";

export default async function InvitePage({ searchParams }: PageProps<"/invita">) {
  await requireOnboardedUser();
  const { code } = await searchParams;

  if (typeof code === "string") {
    const link = `${process.env.BETTER_AUTH_URL}/invito/${encodeURIComponent(code)}`;
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Ecco il tuo invito</h1>
        <CopyLink link={link} />
        <p className="text-sm text-muted-foreground">
          Mandalo a una persona sola: è valido {INVITE_TTL_DAYS} giorni e si usa una volta.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Invita qualcuno</h1>
        <p className="text-muted-foreground">A che ora vorresti che arrivassero le lanterne?</p>
      </header>
      <InviteCreateForm />
    </section>
  );
}
