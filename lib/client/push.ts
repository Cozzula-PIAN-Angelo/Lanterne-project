import { removePushAction, savePushAction } from "@/app/(app)/actions/push";

/**
 * Toglie la sottoscrizione di questo dispositivo, dal browser e dal server. I due passi non dipendono
 * l'uno dall'altro: se il server non risponde, il primo invio riceverà 410 e la riga verrà rimossa.
 * Non lancia mai, così non può impedire di uscire dall'account.
 */
export async function dropPushSubscription(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    const form = new FormData();
    form.set("endpoint", subscription.endpoint);
    await Promise.allSettled([subscription.unsubscribe(), removePushAction(form)]);
  } catch {
    // Solo un browser senza supporto arriva qui, e allora non c'è niente da togliere.
  }
}

/**
 * Toglie solo la riga sul server (serve la sessione) e restituisce la sottoscrizione del browser,
 * che resta: se l'uscita fallisce, si risalva con `restorePushOnServer`.
 */
export async function forgetPushOnServer(): Promise<PushSubscription | null> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = (await registration?.pushManager?.getSubscription()) ?? null;
    if (!subscription) return null;
    const form = new FormData();
    form.set("endpoint", subscription.endpoint);
    await removePushAction(form).catch(() => {});
    return subscription;
  } catch {
    return null;
  }
}

export async function restorePushOnServer(subscription: PushSubscription): Promise<void> {
  try {
    const { keys } = subscription.toJSON();
    const form = new FormData();
    form.set("endpoint", subscription.endpoint);
    form.set("p256dh", keys?.p256dh ?? "");
    form.set("auth", keys?.auth ?? "");
    // savePushAction risponde con { error } invece di lanciare: in entrambi i casi non si può fare altro,
    // si è ancora dentro e le notifiche si riaccendono dal pulsante delle Impostazioni.
    await savePushAction(form);
  } catch {
    // Come sopra: il ripristino è un tentativo, non deve far fallire l'uscita già annullata.
  }
}

export async function unsubscribeBrowser(subscription: PushSubscription): Promise<void> {
  await subscription.unsubscribe().catch(() => {});
}
