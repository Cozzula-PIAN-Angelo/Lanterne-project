export const AUDIO_MAX_SEC = 600;
export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_PX = 2048;
export const DAILY_AUDIO_SEC = 3600;
export const AUDIO_MIMES = ["audio/mp4", "audio/webm"] as const;
export const PHOTO_MIMES = ["image/jpeg"] as const;

/** "audio/mp4;codecs=opus" → "audio/mp4": è la forma salvata e firmata per lo storage. */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function durationLabel(sec: number): string {
  if (sec < 60) return "meno di un minuto";
  const minutes = Math.round(sec / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minuti`;
}
