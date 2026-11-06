"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushAction } from "@/app/(app)/actions/push";
import { registerServiceWorker } from "@/components/pwa-register";
import { dropPushSubscription } from "@/lib/client/push";

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const FAILED = "Non è andata: riprova tra un momento.";

function isIos() {
  // iPadOS si presenta come un Mac: lo tradisce il tocco.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function decodeKey(base64url: string) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function saveSubscription(subscription: PushSubscription) {
  const { keys } = subscription.toJSON();
  const form = new FormData();
  form.set("endpoint", subscription.endpoint);
  form.set("p256dh", keys?.p256dh ?? "");
  form.set("auth", keys?.auth ?? "");
  return savePushAction(form);
}

async function detectStatus(): Promise<Status> {
  if (isIos() && !isInstalled()) return "ios-install";
  const supported =
    VAPID_PUBLIC_KEY !== "" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "off";
  // Il browser può essere passato a questo account senza un'uscita, per esempio a sessione scaduta:
  // l'interruttore acceso deve voler dire che le notifiche arrivano a chi lo sta guardando.
  await saveSubscription(subscription);
  return "on";
}

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    detectStatus()
      .catch((): Status => "off")
      .then((next) => {
        if (current) setStatus(next);
      });
    return () => {
      current = false;
    };
  }, []);

  function turnOn() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        await registerServiceWorker();
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(VAPID_PUBLIC_KEY),
        });
        const result = await saveSubscription(subscription);
        if ("error" in result) {
          await subscription.unsubscribe();
          setError(result.error);
          return;
        }
        setStatus("on");
      } catch {
        setError(FAILED);
      }
    });
  }

  function turnOff() {
    setError(null);
    startTransition(async () => {
      await dropPushSubscription();
      setStatus(await detectStatus().catch((): Status => "off"));
    });
  }

  if (status === "loading") return null;

  if (status === "unsupported") {
    return <p className="text-sm text-muted-foreground">Le notifiche non sono disponibili qui: l&apos;app funziona comunque</p>;
  }
  if (status === "ios-install") {
    return (
      <p className="text-sm text-muted-foreground">
        Su iPhone le notifiche arrivano solo con l&apos;app installata: in Safari tocca Condividi, poi «Aggiungi alla schermata Home», e apri Lanterne da lì.
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        Hai negato il permesso alle notifiche. Per riattivarle, consentile a questo sito nelle impostazioni del browser e ricarica la pagina.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={status === "on"}
          disabled={pending}
          onChange={(e) => (e.target.checked ? turnOn() : turnOff())}
          className="size-5"
        />
        <span>Avvisami quando arrivano le lanterne</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
