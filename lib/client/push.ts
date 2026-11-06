import { removePushAction } from "@/app/(app)/actions/push";

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
