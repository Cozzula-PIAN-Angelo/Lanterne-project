import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, loginWithMagicLink } from "./helpers";

// Solo qui: negli altri file il service worker è bloccato, per non far dipendere quei test dalla sua cache.
test.use({ serviceWorkers: "allow" });

type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };

/** Fino a quando il service worker non controlla la pagina, le richieste vanno dritte in rete. */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Larghezza e altezza scritte nell'intestazione IHDR del PNG. */
function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("il manifest descrive un'app installabile", async ({ page }) => {
  await page.goto("/accedi");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.ok()).toBeTruthy();
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: ManifestIcon[];
  };
  expect(manifest.name).toBe("Lanterne");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");

  for (const size of [192, 512]) {
    const icon = manifest.icons.find((i) => i.sizes === `${size}x${size}` && i.purpose !== "maskable");
    expect(icon, `icona ${size}`).toBeDefined();
    const png = await page.request.get(icon!.src);
    expect(png.ok()).toBeTruthy();
    expect(pngSize(await png.body())).toEqual({ width: size, height: size });
  }

  const maskable = manifest.icons.find((i) => i.purpose === "maskable");
  expect(maskable, "icona maskable").toBeDefined();
  const png = await page.request.get(maskable!.src);
  expect(pngSize(await png.body())).toEqual({ width: 512, height: 512 });
});

test("/sw.js ha gli header giusti", async ({ page }) => {
  const res = await page.request.get("/sw.js");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["cache-control"]).toContain("no-cache");
  expect(res.headers()["content-type"]).toContain("javascript");
});

test("senza rete, una navigazione mostra la pagina offline", async ({ page, context }) => {
  await page.goto("/accedi");
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.goto("/");
  await expect(
    page.getByText("Sei offline. I vocali registrati partiranno al ritorno della rete."),
  ).toBeVisible();
});

test("un push ricevuto diventa una notifica", async ({ page, context }) => {
  await page.goto("/accedi");
  await waitForServiceWorker(page);
  const [worker] = context.serviceWorkers();
  // Il Chromium headless non può mostrare notifiche: si registra la chiamata, il push invece è vero.
  await worker.evaluate(() => {
    const scope = self as unknown as {
      shown: unknown[];
      registration: { showNotification: (title: string, options?: NotificationOptions) => Promise<void> };
    };
    scope.shown = [];
    scope.registration.showNotification = async (title, options) => {
      scope.shown.push({ title, body: options?.body, data: options?.data });
    };
  });

  const cdp = await context.newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const live = registrations.find((r) => !r.isDeleted);
      if (live) resolve(live.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify({ title: "Lanterne", body: "Le lanterne di Marco sono arrivate", url: "/persone/1" }),
  });

  await expect
    .poll(() => worker.evaluate(() => (self as unknown as { shown: unknown[] }).shown))
    .toEqual([{ title: "Lanterne", body: "Le lanterne di Marco sono arrivate", data: { url: "/persone/1" } }]);
});

test("il tocco su una notifica apre solo percorsi interni", async ({ page, context }) => {
  await page.goto("/accedi");
  await waitForServiceWorker(page);
  const [worker] = context.serviceWorkers();

  const paths = await worker.evaluate(() => {
    const { internalPath } = self as unknown as { internalPath: (url: unknown) => string };
    return [
      "/persone/1?a=2",
      "https://altro.example/persone",
      "//altro.example/x",
      "/\\altro.example/x",
      "javascript:alert(1)",
      undefined,
    ].map(internalPath);
  });

  expect(paths).toEqual(["/persone/1?a=2", "/", "/", "/", "/", "/"]);
});

test("le pagine autenticate non finiscono nella cache", async ({ page }) => {
  await loginWithMagicLink(page, "pwa-cache@lanterne.test");
  await completeOnboarding(page, "Pia", "Europe/Rome");
  await page.goto("/");
  await waitForServiceWorker(page);

  // Questa risposta passa dal service worker: è il caso in cui potrebbe salvarla.
  const res = await page.reload();
  expect(res?.fromServiceWorker()).toBe(true);
  expect(res?.ok()).toBe(true);

  const cached = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) paths.push(new URL(req.url).pathname);
    }
    return { home: (await caches.match("/")) !== undefined, paths };
  });
  expect(cached.home).toBe(false);
  expect(cached.paths).toEqual(["/offline"]);
});
