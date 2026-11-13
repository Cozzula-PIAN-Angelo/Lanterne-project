import Link from "next/link";

// Link alle due pagine pubbliche, in fondo a /accedi e alle Impostazioni.
export function InfoFooter() {
  return (
    <footer className="flex gap-4 text-sm text-muted-foreground">
      <Link href="/privacy" className="underline underline-offset-4">
        Privacy
      </Link>
      <Link href="/se-stai-male" className="underline underline-offset-4">
        Se stai male
      </Link>
    </footer>
  );
}
