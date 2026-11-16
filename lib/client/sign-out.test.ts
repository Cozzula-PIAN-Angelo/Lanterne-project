import { expect, test, vi } from "vitest";
import { signOutDevice } from "./sign-out";

const sub = { endpoint: "https://push.test/x" } as PushSubscription;

function deps(over: { sub?: PushSubscription | null; ok?: boolean } = {}) {
  const subscription = "sub" in over ? over.sub! : sub;
  return {
    forgetPushOnServer: vi.fn(async () => subscription),
    restorePushOnServer: vi.fn(async () => {}),
    unsubscribeBrowser: vi.fn(async () => {}),
    signOut: vi.fn(async () => ({ ok: over.ok ?? true })),
    clearLocalData: vi.fn(async () => {}),
  };
}

test("uscita fallita: la sottoscrizione viene risalvata e niente viene cancellato", async () => {
  const d = deps({ ok: false });
  expect(await signOutDevice(d)).toBe(false);
  expect(d.restorePushOnServer).toHaveBeenCalledWith(sub);
  expect(d.unsubscribeBrowser).not.toHaveBeenCalled();
  expect(d.clearLocalData).not.toHaveBeenCalled();
});

test("uscita riuscita: si disiscrive dal browser e si svuotano i dati locali", async () => {
  const d = deps();
  expect(await signOutDevice(d)).toBe(true);
  expect(d.unsubscribeBrowser).toHaveBeenCalledWith(sub);
  expect(d.clearLocalData).toHaveBeenCalled();
  expect(d.restorePushOnServer).not.toHaveBeenCalled();
});

test("senza sottoscrizione si esce lo stesso, senza niente da ripristinare", async () => {
  const failed = deps({ sub: null, ok: false });
  expect(await signOutDevice(failed)).toBe(false);
  expect(failed.signOut).toHaveBeenCalled();
  expect(failed.restorePushOnServer).not.toHaveBeenCalled();

  const done = deps({ sub: null });
  expect(await signOutDevice(done)).toBe(true);
  expect(done.unsubscribeBrowser).not.toHaveBeenCalled();
  expect(done.clearLocalData).toHaveBeenCalled();
});

test("signOut che lancia conta come uscita fallita: si ripristina, senza rifiuti", async () => {
  const d = deps();
  d.signOut.mockRejectedValue(new Error("rete"));
  await expect(signOutDevice(d)).resolves.toBe(false);
  expect(d.restorePushOnServer).toHaveBeenCalledWith(sub);
  expect(d.unsubscribeBrowser).not.toHaveBeenCalled();
  expect(d.clearLocalData).not.toHaveBeenCalled();
});

test("clearLocalData che lancia dopo un'uscita riuscita non impedisce di finire l'uscita", async () => {
  const d = deps();
  d.clearLocalData.mockRejectedValue(new Error("IndexedDB rotto"));
  await expect(signOutDevice(d)).resolves.toBe(true);
  expect(d.unsubscribeBrowser).toHaveBeenCalledWith(sub);
});
