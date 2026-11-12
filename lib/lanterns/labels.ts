import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { LanternView } from "@/lib/access/lanterns";
import { durationLabel } from "./media";

const TYPE_NAMES: Record<LanternView["type"], string> = {
  audio: "Vocale",
  photo: "Foto",
  text: "Testo",
  thought: "Pensiero",
};

function ofClock(at: Date, tz: string): string {
  const time = format(new TZDate(at.getTime(), tz), "H:mm");
  if (time === "0:00") return "di mezzanotte";
  return time.startsWith("1:") ? `dell'${time}` : `delle ${time}`;
}

/** L'etichetta per lo screen reader: "Vocale di Giulia, 3 minuti, delle 9:14". */
export function lanternLabel(input: {
  type: LanternView["type"];
  senderName: string;
  durationSec: number | null;
  createdAt: Date;
  viewerTz: string;
}): string {
  const { type, senderName, durationSec, createdAt, viewerTz } = input;
  const duration = type === "audio" && durationSec !== null ? `, ${durationLabel(durationSec)}` : "";
  return `${TYPE_NAMES[type]} di ${senderName}${duration}, ${ofClock(createdAt, viewerTz)}`;
}
