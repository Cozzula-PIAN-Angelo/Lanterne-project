import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Se stai male · Lanterne" };

// Numeri e orari verificati sul sito ufficiale telefonoamico.it il 2026-11-13 (vedi docs/sviluppo.md).
export default function SupportPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-10">
      <header className="space-y-1">
        <Link href="/accedi" className="text-sm underline underline-offset-4">
          Lanterne
        </Link>
        <h1 className="text-2xl font-semibold">Se stai male</h1>
      </header>
      <p>Lanterne non è un servizio di supporto e nessuno la segue in tempo reale.</p>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Pericolo immediato</h2>
        <p>
          In caso di pericolo immediato si può chiamare il{" "}
          <a href="tel:112" className="font-semibold underline underline-offset-4">
            112
          </a>
          .
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Per parlare con qualcuno</h2>
        <p>
          Telefono Amico Italia risponde allo{" "}
          <a href="tel:+390223272327" className="underline underline-offset-4">
            02 2327 2327
          </a>
          , tutti i giorni, 24 ore su 24. Il servizio è gratuito; il costo della chiamata dipende dall&apos;operatore.
        </p>
        <p>
          Su WhatsApp Amico, al{" "}
          <a href="https://wa.me/393240117252" className="underline underline-offset-4">
            324 011 72 52
          </a>
          , rispondono tutti i giorni dalle 18 alle 21.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Fuori dall&apos;Italia</h2>
        <p>
          <a href="https://findahelpline.com" className="underline underline-offset-4">
            findahelpline.com
          </a>{" "}
          raccoglie i servizi di ascolto di ogni paese.
        </p>
      </section>
      <p>Parlarne con una persona di fiducia può aiutare.</p>
    </main>
  );
}
