"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { uploadMedia } from "@/lib/client/upload-media";
import { AUDIO_MAX_SEC } from "@/lib/lanterns/media";
import { pickRecorderMime } from "@/lib/lanterns/recorder-mime";

type Status = "idle" | "starting" | "recording" | "sending";

const NO_CHANGE = () => () => {};

function supportedMime(): string | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return null;
  return pickRecorderMime((mime) => MediaRecorder.isTypeSupported(mime));
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function permissionMessage(error: unknown): string {
  return error instanceof DOMException && error.name === "NotAllowedError"
    ? "Per registrare, riattiva il microfono dalle impostazioni del browser. Intanto puoi scrivere."
    : "Il microfono non risponde. Intanto puoi scrivere.";
}

export function AudioRecorder({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  // undefined durante il rendering sul server: il browser si conosce solo dopo.
  const mime = useSyncExternalStore(NO_CHANGE, supportedMime, () => undefined);
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  /** Cambia a ogni abbandono: una registrazione di un tentativo passato non vale più. */
  const attempt = useRef(0);

  // Si ferma da solo al limite.
  useEffect(() => {
    if (status !== "recording") return;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const seconds = Math.floor((performance.now() - startedAt) / 1000);
      setElapsed(seconds);
      if (seconds >= AUDIO_MAX_SEC) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [status]);

  // Lasciare la pagina scarta la registrazione. Activity conserva lo stato,
  // quindi al ritorno il registratore va trovato di nuovo pronto.
  useLayoutEffect(
    () => () => {
      attempt.current += 1;
      setElapsed(0);
      setStatus((current) => (current === "sending" ? current : "idle"));
      if (recorder.current?.state === "recording") {
        recorder.current.stop();
        setError("La registrazione si è interrotta: il vocale non è partito.");
      }
    },
    [],
  );

  async function send(blob: Blob, durationSec: number) {
    setStatus("sending");
    const outcome = await uploadMedia({ connectionId, type: "audio", blob, durationSec });
    setStatus("idle");
    if (outcome.kind === "sent") router.refresh();
    else if (outcome.kind === "rejected") setError(outcome.message);
    else setError("Non c'è rete: il vocale non è partito.");
  }

  async function start() {
    if (!mime) return;
    setError(null);
    setElapsed(0);
    setStatus("starting");
    attempt.current += 1;
    const current = attempt.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      if (current !== attempt.current) return;
      setStatus("idle");
      setError(permissionMessage(cause));
      return;
    }

    // Il microfono si libera subito: la spia del telefono non deve restare accesa.
    const releaseMic = () => stream.getTracks().forEach((track) => track.stop());
    // Il permesso può arrivare quando la pagina è già stata lasciata.
    if (current !== attempt.current) {
      releaseMic();
      return;
    }

    try {
      const media = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      const startedAt = performance.now();
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        releaseMic();
        if (recorder.current === media) recorder.current = null;
        if (current !== attempt.current) return;
        const durationSec = Math.min(AUDIO_MAX_SEC, Math.max(1, Math.ceil((performance.now() - startedAt) / 1000)));
        void send(new Blob(chunks, { type: media.mimeType }), durationSec);
      };
      media.start();
      recorder.current = media;
      setStatus("recording");
    } catch (cause) {
      releaseMic();
      setStatus("idle");
      setError(permissionMessage(cause));
    }
  }

  if (mime === undefined) return null;
  if (mime === null) {
    return <p className="text-sm text-muted-foreground">Questo browser non può registrare: puoi scrivere.</p>;
  }

  return (
    <div className="space-y-2">
      {status === "recording" ? (
        <div className="flex items-center gap-3">
          <Button type="button" size="lg" onClick={() => recorder.current?.stop()}>
            Ferma e invia
          </Button>
          <span role="timer" className="text-sm tabular-nums">
            {clock(elapsed)}
          </span>
        </div>
      ) : (
        <Button type="button" size="lg" disabled={status !== "idle"} onClick={start}>
          {status === "sending" ? "Invio in corso…" : "Registra"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
