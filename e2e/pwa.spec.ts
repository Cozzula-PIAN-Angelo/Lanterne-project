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
