import Link from "next/link";
import { unblockAction } from "@/app/(app)/actions/connections";
import { ActionButton } from "@/components/action-button";
import { AllowSavingToggle } from "@/components/allow-saving-toggle";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { PushToggle } from "@/components/push-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { listBlocked } from "@/lib/access/blocks";
import { requireOnboardedUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export default async function SettingsPage({ searchParams }: PageProps<"/impostazioni">) {
  const user = await requireOnboardedUser();
  const { salvato } = await searchParams;
  const blocked = await listBlocked(db, user.id);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/" className="text-sm underline underline-offset-4">
          Le tue persone
        </Link>
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
      </header>

      <section className="space-y-3">
        <ProfileForm
          defaultName={user.name}
          defaultColor={user.color ?? null}
          defaultTimezone={user.timezone ?? undefined}
          next="/impostazioni?salvato=1"
          submitLabel="Salva"
        />
        {salvato && <p role="status">Salvato.</p>}
      </section>

      <AllowSavingToggle defaultChecked={user.allowSaving ?? true} />

      <PushToggle />

      <section aria-label="Persone bloccate" className="space-y-3">
        <h2 className="text-lg font-medium">Persone bloccate</h2>
        {blocked.length === 0 && <p className="text-sm text-muted-foreground">Nessuna.</p>}
        <ul className="space-y-2">
          {blocked.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3">
              <span>{person.name}</span>
              <ActionButton action={unblockAction} fields={{ blockedId: person.id }} variant="outline">
                Sblocca
              </ActionButton>
            </li>
          ))}
        </ul>
      </section>

      <SignOutButton userId={user.id} />

      <DeleteAccountForm userId={user.id} />
    </div>
  );
}
