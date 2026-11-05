import { THOUGHTS } from "./constants";
import { durationLabel } from "./media";

/** Il testo da mostrare: per un pensiero, nel database c'è l'id e la frase sta nelle costanti. */
export function lanternContent(lantern: {
  type: string;
  text: string | null;
  durationSec?: number | null;
}): string {
  if (lantern.type === "audio") return `Vocale, ${durationLabel(lantern.durationSec ?? 0)}`;
  if (lantern.type === "photo") return "Foto";
  if (lantern.type !== "thought") return lantern.text ?? "";
  return THOUGHTS.find((t) => t.id === lantern.text)?.text ?? "";
}
