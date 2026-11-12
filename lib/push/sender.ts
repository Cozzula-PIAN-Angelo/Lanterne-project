import webPush from "web-push";
import type { PushSender } from "@/lib/access/push";

const ONE_DAY_SECONDS = 24 * 60 * 60;

export const webPushSender: PushSender = async (sub, message) => {
  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      {
        // Le chiavi si leggono qui: un .env senza VAPID fa fallire l'invio, non l'avvio del worker.
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT ?? "",
          publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
          privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
        },
        // Un telefono spento per giorni non deve ricevere avvisi di lanterne ormai spente.
        TTL: ONE_DAY_SECONDS,
        // Un servizio che non risponde non deve bloccare gli altri invii del job.
        timeout: 10_000,
      },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
};
