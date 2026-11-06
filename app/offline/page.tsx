import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline · Lanterne" };

// Il service worker conserva solo questo HTML: senza rete il CSS e i font non arrivano,
// quindi l'aspetto della pagina deve stare tutto qui, negli stili in linea.
export default function OfflinePage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "1.5rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.5,
        background: "#131c2e",
        color: "#f4efe6",
      }}
    >
      <p style={{ margin: 0, maxWidth: "24rem" }}>
        Sei offline. I vocali registrati partiranno al ritorno della rete.
      </p>
      {/* Un link normale: qui il JavaScript dell'app non è disponibile. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" style={{ color: "#f3c677", padding: "0.75rem" }}>
        Riprova
      </a>
    </main>
  );
}
