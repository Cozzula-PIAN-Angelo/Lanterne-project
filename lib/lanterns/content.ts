import { THOUGHTS } from "./constants";

/** Il testo da mostrare: per un pensiero, nel database c'è l'id e la frase sta nelle costanti. */
export function lanternContent(lantern: { type: string; text: string | null }): string {
  if (lantern.type !== "thought") return lantern.text ?? "";
  return THOUGHTS.find((t) => t.id === lantern.text)?.text ?? "";
}
