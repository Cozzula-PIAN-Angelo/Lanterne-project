import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { computeRevealAt } from "@/lib/time/lantern-times";
import { closeContexts, connectPair, openLantern, resetAuthRateLimit, setClockOffset } from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

const WAITING = /^Vocale per Luca: in attesa di rete$/;
// Con la rete accesa e l'invio fallito la riga passa per "nuovo tentativo tra poco".
const QUEUED = /^Vocale per Luca: (in attesa di rete|nuovo tentativo tra poco|invio in corso…)$/;
const QUEUED_IDLE = /^Vocale per Luca: (in attesa di rete|nuovo tentativo tra poco)$/;

async function openChannel(page: Page, partner: string) {
  await page.goto("/");
  await page.getByRole("link", { name: partner }).click();
  await expect(page).toHaveURL(/\/persone\//);
  // L'URL cambia mentre la pagina è ancora in streaming: andare offline adesso la lascerebbe su "Un attimo…".
  await expect(page.getByRole("button", { name: "Registra" })).toBeVisible();
  return page.url().split("/persone/")[1];
}

async function record(page: Page) {
  await page.getByRole("button", { name: "Registra" }).click();
  await expect(page.getByRole("button", { name: "Ferma e invia" })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Ferma e invia" }).click();
}

async function sql<T extends postgres.MaybeRow>(run: (client: postgres.Sql) => Promise<T[]>) {
  const client = postgres(process.env.DATABASE_URL_E2E ?? "", { max: 1, onnotice: () => {} });
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const setStatus = (connectionId: string, status: "active" | "ended") =>
  sql((c) => c`UPDATE connections SET status = ${status} WHERE id = ${connectionId}`);

const voiceCount = async (connectionId: string) => {
  const [row] = await sql(
    (c) => c`SELECT count(*)::int AS n FROM lanterns WHERE connection_id = ${connectionId} AND status = 'ready'`,
  );
  return row.n as number;
};

/** Il server risponde, lo storage no: l'elemento resta in coda anche con la rete accesa. */
const breakStorage = (page: Page) => page.route(/:9000\//, (route) => route.abort());

const queuedOnDevice = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("lanterne-outbox");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("items")) return resolve(0);
          const count = db.transaction("items").objectStore("items").count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        };
      }),
  );

test("un vocale registrato offline parte al ritorno della rete", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-parte");
  await openChannel(anna, "Luca");

  await anna.context().setOffline(true);
  await record(anna);
  await expect(anna.getByText(WAITING)).toBeVisible();
  const mine = anna.getByRole("list", { name: "Le tue lanterne" });
  await expect(mine.getByRole("button", { name: /^Vocale di Anna/ })).toHaveCount(0);

  await anna.context().setOffline(false);
  await expect((await openLantern(anna, "Le tue lanterne", /^Vocale di Anna/)).getByText("Vocale, meno di un minuto")).toBeVisible();
  await expect(anna.getByText(WAITING)).toHaveCount(0);
});

test("la coda sopravvive alla chiusura della pagina", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-riapre");
  const connectionId = await openChannel(anna, "Luca");
  await breakStorage(anna);
  await record(anna);
  await expect(anna.getByText(QUEUED)).toBeVisible();

  await anna.reload();
  await expect(anna.getByText(QUEUED)).toBeVisible();

  await anna.unroute(/:9000\//);
  await anna.reload();
  await expect((await openLantern(anna, "Le tue lanterne", /^Vocale di Anna/)).getByText("Vocale, meno di un minuto")).toBeVisible();
  expect(await voiceCount(connectionId)).toBe(1);
});

test("un invio fallito con la rete accesa riprova da solo", async ({ browser }) => {
  test.setTimeout(60_000);
  const { anna } = await connectPair(browser, "offline-riprova-sola");
  await openChannel(anna, "Luca");
  await breakStorage(anna);
  await record(anna);
  await expect(anna.getByText(QUEUED)).toBeVisible();

  await anna.unroute(/:9000\//);
  const voice = await openLantern(anna, "Le tue lanterne", /^Vocale di Anna/, { timeout: 20_000 });
  await expect(voice.getByText("Vocale, meno di un minuto")).toBeVisible();
  await expect(anna.getByText(QUEUED)).toHaveCount(0);
});

test("tornando sull'app un invio fallito riprova subito", async ({ browser }) => {
  test.setTimeout(60_000);
  const { anna } = await connectPair(browser, "offline-riprova-subito");
  await openChannel(anna, "Luca");
  await breakStorage(anna);
  await record(anna);
  await expect(anna.getByText(QUEUED)).toBeVisible();
  // Passa il primo tentativo automatico: il prossimo sarebbe tra 30 secondi, oltre l'attesa qui sotto.
  await anna.waitForTimeout(7000);

  await anna.unroute(/:9000\//);
  await anna.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const voice = await openLantern(anna, "Le tue lanterne", /^Vocale di Anna/, { timeout: 10_000 });
  await expect(voice.getByText("Vocale, meno di un minuto")).toBeVisible();
});

test("riprova e scarta funzionano dopo un rifiuto", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-rifiuto");
  const connectionId = await openChannel(anna, "Luca");

  await anna.context().setOffline(true);
  await record(anna);
  await expect(anna.getByText(WAITING)).toBeVisible();
  await setStatus(connectionId, "ended");
  await anna.context().setOffline(false);
  const panel = anna.getByRole("region", { name: "Lanterne non ancora partite" });
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(anna.getByText(WAITING)).toHaveCount(0);

  await setStatus(connectionId, "active");
  await panel.getByRole("button", { name: "Riprova" }).click();
  await expect((await openLantern(anna, "Le tue lanterne", /^Vocale di Anna/)).getByText("Vocale, meno di un minuto")).toBeVisible();
  await expect(panel).toHaveCount(0);
  expect(await voiceCount(connectionId)).toBe(1);

  await anna.context().setOffline(true);
  await record(anna);
  await expect(anna.getByText(WAITING)).toBeVisible();
  await setStatus(connectionId, "ended");
  await anna.context().setOffline(false);
  await expect(panel.getByRole("alert")).toBeVisible();
  await panel.getByRole("button", { name: "Scarta" }).click();
  await expect(panel).toHaveCount(0);
  expect(await queuedOnDevice(anna)).toBe(0);
  expect(await voiceCount(connectionId)).toBe(1);
});

test("uscendo con vocali in coda l'app avvisa e li cancella", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-esci");
  await openChannel(anna, "Luca");
  await breakStorage(anna);
  await record(anna);
  await expect(anna.getByText(QUEUED)).toBeVisible();
  expect(await queuedOnDevice(anna)).toBe(1);

  await anna.goto("/impostazioni");
  // Il pannello esiste solo nel browser: quando il primo giro finisce, la pagina risponde ai tocchi.
  await expect(anna.getByText(QUEUED_IDLE)).toBeVisible();
  await anna.getByRole("button", { name: "Esci", exact: true }).click();
  await expect(anna.getByText("Hai 1 lanterna non ancora partita: uscendo verrà cancellata")).toBeVisible();
  await anna.getByRole("button", { name: "Annulla" }).click();
  await expect(anna).toHaveURL(/\/impostazioni/);
  expect(await queuedOnDevice(anna)).toBe(1);

  await anna.getByRole("button", { name: "Esci", exact: true }).click();
  await anna.getByRole("button", { name: "Esci e cancella" }).click();
  await expect(anna).toHaveURL(/\/accedi/);
  expect(await queuedOnDevice(anna)).toBe(0);
});

test("eliminare l'account svuota la coda", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-elimina");
  await openChannel(anna, "Luca");
  await breakStorage(anna);
  await record(anna);
  await expect(anna.getByText(QUEUED)).toBeVisible();

  await anna.goto("/impostazioni");
  await anna.getByLabel("Scrivi ELIMINA per confermare").fill("ELIMINA");
  await anna.getByRole("button", { name: "Elimina l'account" }).click();
  await expect(anna).toHaveURL(/\/accedi/);
  expect(await queuedOnDevice(anna)).toBe(0);
});

test("due schede aperte non inviano lo stesso vocale due volte", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-schede");
  const connectionId = await openChannel(anna, "Luca");
  const second = await anna.context().newPage();
  await second.goto(`/persone/${connectionId}`);
  await expect(second.getByRole("heading", { name: "Luca" })).toBeVisible();

  await anna.context().setOffline(true);
  await record(anna);
  await expect(anna.getByText(WAITING)).toBeVisible();

  await anna.context().setOffline(false);
  await expect((await openLantern(anna, "Le tue lanterne", /^Vocale di Anna/)).getByText("Vocale, meno di un minuto")).toBeVisible();
  await anna.waitForTimeout(1500);
  expect(await voiceCount(connectionId)).toBe(1);
});

test("senza IndexedDB il vocale resta in memoria e l'app lo dice", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-noidb");
  await anna.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get: () => undefined });
  });
  await openChannel(anna, "Luca");

  await anna.context().setOffline(true);
  await record(anna);
  await expect(anna.getByText(WAITING)).toBeVisible();
  await expect(anna.getByText(/non chiudere la pagina/)).toBeVisible();

  await anna.context().setOffline(false);
  await expect((await openLantern(anna, "Le tue lanterne", /^Vocale di Anna/)).getByText("Vocale, meno di un minuto")).toBeVisible();
});

test("se l'orario è passato mentre aspettava, avvisa che parte la sera dopo", async ({ browser }) => {
  const { anna } = await connectPair(browser, "offline-tardi");
  await openChannel(anna, "Luca");

  await anna.context().setOffline(true);
  await record(anna);
  await expect(anna.getByText(WAITING)).toBeVisible();

  const revealAt = computeRevealAt(
    { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null },
    "America/New_York",
    new Date(Date.now()),
  );
  await setClockOffset(anna, revealAt.getTime() - Date.now() + 60_000);
  await anna.context().setOffline(false);

  await expect(anna.getByText("La lanterna per Luca era in attesa di rete: partirà la sera dopo.")).toBeVisible();
});
