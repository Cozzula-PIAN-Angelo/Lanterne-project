type SignOutDeps = {
  /** Toglie la riga sul server e restituisce la sottoscrizione del browser, che resta. */
  forgetPushOnServer(): Promise<PushSubscription | null>;
  restorePushOnServer(sub: PushSubscription): Promise<void>;
  unsubscribeBrowser(sub: PushSubscription): Promise<void>;
  signOut(): Promise<{ ok: boolean }>;
  clearLocalData(): Promise<void>;
};

/**
 * Esce da questo dispositivo. La riga sul server si toglie prima (serve la sessione), ma la sottoscrizione
 * resta nel browser finché l'uscita non è riuscita: se fallisce, si risalva e le notifiche non si spengono.
 */
export async function signOutDevice(deps: SignOutDeps): Promise<boolean> {
  const subscription = await deps.forgetPushOnServer();
  // Una uscita che lancia (rete assente) vale come fallita: la sottoscrizione va ripristinata.
  const ok = await deps
    .signOut()
    .then((result) => result.ok)
    .catch(() => false);
  if (!ok) {
    if (subscription) await deps.restorePushOnServer(subscription);
    return false;
  }
  // Si è già usciti: un errore nella pulizia locale non deve fermare il passaggio a /accedi.
  if (subscription) await deps.unsubscribeBrowser(subscription).catch(() => {});
  await deps.clearLocalData().catch(() => {});
  return true;
}
