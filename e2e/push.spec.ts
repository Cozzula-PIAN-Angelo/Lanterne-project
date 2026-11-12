import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { completeOnboarding, loginWithMagicLink, resetAuthRateLimit } from "./helpers";

// Il servizio push vero non è raggiungibile dai test: si sostituisce solo la parte del browser che lo chiama.
// Il dispositivo reale è coperto dalla prova su Android (Task 12).
test.use({ serviceWorkers: "allow" });

const ENDPOINT = "https://push.example.test/dispositivo-e2e";

function stubPushService(endpoint: string) {
  // Il Chromium headless risponde "denied" anche dopo grantPermissions.
  Object.defineProperty(Notification, "permission", { get: () => "granted" });
  Notification.requestPermission = async () => "granted";
  const current = () =>
    localStorage.getItem("stub-push")
      ? {
          endpoint,
          toJSON: () => ({ endpoint, keys: { p256dh: "BPk3dGVzdA", auth: "dGVzdA" } }),
          unsubscribe: async () => {
            localStorage.removeItem("stub-push");
            return true;
          },
        }
      : null;
  PushManager.prototype.getSubscription = async () => current() as unknown as PushSubscription;
  PushManager.prototype.subscribe = async () => {
    localStorage.setItem("stub-push", "1");
    return current() as unknown as PushSubscription;
  };
}

async function savedEndpoints() {
  const client = postgres(process.env.DATABASE_URL_E2E ?? "", { max: 1, onnotice: () => {} });
  try {
    const rows = await client`SELECT endpoint FROM push_subscriptions`;
    return rows.map((row) => row.endpoint as string);
  } finally {
    await client.end();
  }
}

async function openSettings(page: Page, tag: string) {
  await resetAuthRateLimit();
  await loginWithMagicLink(page, `push-${tag}@lanterne.test`);
  await completeOnboarding(page, "Pia", "Europe/Rome");
  await page.goto("/impostazioni");
}

const toggle = (page: Page) => page.getByRole("checkbox", { name: "Avvisami quando arrivano le lanterne" });

test("attivare, disattivare e uscire tengono allineata la sottoscrizione", async ({ page }) => {
  await page.addInitScript(stubPushService, ENDPOINT);
  await openSettings(page, "attiva");

  await toggle(page).click();
  await expect(toggle(page)).toBeChecked();
  await expect.poll(savedEndpoints).toEqual([ENDPOINT]);

  await page.reload();
  await expect(toggle(page)).toBeChecked();

  await toggle(page).click();
  await expect(toggle(page)).not.toBeChecked();
  await expect.poll(savedEndpoints).toEqual([]);

  // Un telefono condiviso: chi esce non deve più ricevere notifiche con i nomi delle sue persone.
  await toggle(page).click();
  await expect.poll(savedEndpoints).toEqual([ENDPOINT]);
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/accedi/);
  expect(await savedEndpoints()).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("stub-push"))).toBeNull();
});

test("eliminare l'account spegne anche le notifiche del dispositivo", async ({ page }) => {
  await page.addInitScript(stubPushService, ENDPOINT);
  await openSettings(page, "elimina");
  await toggle(page).click();
  await expect.poll(savedEndpoints).toEqual([ENDPOINT]);

  await page.getByLabel("Scrivi ELIMINA per confermare").fill("ELIMINA");
  await page.getByRole("button", { name: "Elimina l'account" }).click();
  await expect(page).toHaveURL(/\/accedi/);

  expect(await savedEndpoints()).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("stub-push"))).toBeNull();
});

test("il permesso non si chiede finché non si tocca l'interruttore", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { asked: number }).asked = 0;
    Object.defineProperty(Notification, "permission", { get: () => "default" });
    Notification.requestPermission = async () => {
      (window as unknown as { asked: number }).asked++;
      return "default";
    };
  });
  await openSettings(page, "tocco");
  await expect(toggle(page)).not.toBeChecked();
  expect(await page.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(0);

  await toggle(page).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(1);
  await expect(toggle(page)).not.toBeChecked();
});

test("senza supporto lo dice, e l'app funziona comunque", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  });
  await openSettings(page, "nosupporto");
  await expect(page.getByText("Le notifiche non sono disponibili qui: l'app funziona comunque")).toBeVisible();
  await expect(toggle(page)).toHaveCount(0);
});

test("con il permesso negato spiega come riattivarle", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "denied" });
  });
  await openSettings(page, "negato");
  await expect(page.getByText(/Hai negato il permesso/)).toBeVisible();
  await expect(toggle(page)).toHaveCount(0);
});

test("su iPhone, se l'app non è installata, guida ad aggiungerla alla Home", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" });
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  });
  await openSettings(page, "iphone");
  await expect(page.getByText(/Aggiungi alla schermata Home/)).toBeVisible();
  await expect(page.getByText("Le notifiche non sono disponibili qui")).toHaveCount(0);
});
