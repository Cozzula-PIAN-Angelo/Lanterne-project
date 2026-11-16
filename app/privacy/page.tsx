import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Lanterne" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-10">
      <header className="space-y-1">
        <Link href="/accedi" className="text-sm underline underline-offset-4">
          Lanterne
        </Link>
        <h1 className="text-2xl font-semibold">Privacy</h1>
      </header>
      <p>
        Lanterne è un progetto dimostrativo, non ancora pubblicato online. Questa pagina spiega in modo semplice come
        funziona, ma non è un&apos;informativa legale completa.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Cosa viene salvato</h2>
        <p>
          Email, nome, colore e fuso orario. Le lanterne e i loro file. Le reazioni. Le sottoscrizioni alle notifiche.
          Le sessioni di accesso.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Per quanto</h2>
        <p>
          Una lanterna sparisce alle 6 del mattino di chi la riceve, con almeno 8 ore per ascoltarla. Viene cancellata
          davvero, dal database e dallo spazio dei file. Restano solo le lanterne che qualcuno ha scelto di conservare.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Chi la vede</h2>
        <p>Solo chi la riceve, dopo l&apos;orario stabilito, e chi l&apos;ha mandata. Nessun altro.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">La posizione</h2>
        <p>
          Se la attivi, la posizione resta sul telefono, arrotondata a circa 10 km. Non viene mai inviata a Lanterne.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Analisi e pubblicità</h2>
        <p>Nessuna analisi di terze parti, nessuna pubblicità. I log non contengono mai i contenuti delle lanterne.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Le foto</h2>
        <p>Prima di partire le foto perdono i metadati, compresa la posizione GPS.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Eliminare l&apos;account</h2>
        <p>Eliminando l&apos;account si cancellano i dati, i file e le connessioni.</p>
      </section>
    </main>
  );
}
