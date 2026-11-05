const PREFERRED = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
];

/** Il formato da chiedere a MediaRecorder: prima quelli che si riproducono ovunque. */
export function pickRecorderMime(isTypeSupported: (mime: string) => boolean): string | null {
  return PREFERRED.find(isTypeSupported) ?? null;
}
