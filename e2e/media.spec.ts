import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { computeRevealAt } from "@/lib/time/lantern-times";
import { closeContexts, connectPair, resetAuthRateLimit, setClockOffset } from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

async function openChannel(page: Page, partner: string) {
  await page.goto("/");
  await page.getByRole("link", { name: partner }).click();
  await expect(page).toHaveURL(/\/persone\//);
  return page.url();
}

function offsetToArrival() {
  const revealAt = computeRevealAt(
    { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null },
    "America/New_York",
    new Date(Date.now()),
  );
  return revealAt.getTime() - Date.now() + 60_000;
}

test("un vocale si registra, parte all'orario e si ascolta", async ({ browser }) => {
  const { anna, luca } = await connectPair(browser, "vocale");
  const channel = await openChannel(anna, "Luca");

  await anna.getByRole("button", { name: "Registra" }).click();
  await expect(anna.getByRole("button", { name: "Ferma e invia" })).toBeVisible();
  await anna.waitForTimeout(1200);
  await anna.getByRole("button", { name: "Ferma e invia" }).click();

  const mine = anna.getByRole("region", { name: "Le tue lanterne" });
  await expect(mine.getByText("Vocale, meno di un minuto")).toBeVisible();
  await expect(mine.getByRole("button", { name: "Elimina" })).toBeVisible();

  // Chi l'ha mandato può riascoltarlo.
  await mine.getByRole("button", { name: /^Riascolta/ }).click();
  await expect(mine.locator("audio")).toHaveAttribute("src", /X-Amz-Signature/);

  // Prima dell'arrivo Luca non vede niente.
  await luca.goto(channel);
  await expect(luca.getByRole("heading", { name: "Anna" })).toBeVisible();
  await expect(luca.getByText("Vocale")).toHaveCount(0);

  await setClockOffset(luca, offsetToArrival());
  await luca.reload();
  const arrived = luca.getByRole("region", { name: "Arrivate" });
  await arrived.getByRole("button", { name: /^Ascolta: Vocale di Anna/ }).click();
  const audio = arrived.locator("audio");
  await expect(audio).toHaveAttribute("src", /X-Amz-Signature/);

  const src = await audio.getAttribute("src");
  const res = await luca.request.get(src!);
  expect(res.status()).toBe(200);
  expect((await res.body()).length).toBeGreaterThan(0);

  // Il link firmato non basta a chi tocca il file senza firma.
  const unsigned = new URL(src!);
  const denied = await luca.request.get(`${unsigned.origin}${unsigned.pathname}`);
  expect(denied.status()).toBe(403);
});

test("senza permesso del microfono restano testo e pensieri", async ({ browser }) => {
  const { anna } = await connectPair(browser, "permesso");
  await anna.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("negato", "NotAllowedError"));
  });
  await openChannel(anna, "Luca");
  await anna.reload();

  await anna.getByRole("button", { name: "Registra" }).click();
  await expect(anna.getByRole("alert").filter({ hasText: "riattiva il microfono" })).toBeVisible();

  await anna.getByLabel("La tua lanterna").fill("scrivo lo stesso");
  await anna.getByRole("button", { name: "Lascia la lanterna" }).click();
  await expect(anna.getByRole("region", { name: "Le tue lanterne" }).getByText("scrivo lo stesso")).toBeVisible();
});

test("il browser senza MediaRecorder avvisa e nasconde il pulsante", async ({ browser }) => {
  const { anna } = await connectPair(browser, "senzarec");
  await anna.addInitScript(() => {
    // @ts-expect-error: simula un browser che non può registrare
    delete window.MediaRecorder;
  });
  await openChannel(anna, "Luca");
  await anna.reload();

  await expect(anna.getByText("Questo browser non può registrare")).toBeVisible();
  await expect(anna.getByRole("button", { name: "Registra" })).toHaveCount(0);
  await expect(anna.getByLabel("La tua lanterna")).toBeVisible();
});

/** Registra i flussi del microfono e, se richiesto, trattiene la risposta del permesso. */
async function watchMicrophone(page: Page, { hold }: { hold: boolean }) {
  await page.addInitScript((holdPermission) => {
    const probe = window as unknown as { micStreams: MediaStream[]; grantMic?: () => void };
    probe.micStreams = [];
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (holdPermission) await new Promise<void>((resolve) => (probe.grantMic = resolve));
      const stream = await real(constraints);
      probe.micStreams.push(stream);
      return stream;
    };
  }, hold);
}

const liveMicTracks = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { micStreams: MediaStream[] }).micStreams
      .flatMap((stream) => stream.getTracks())
      .filter((track) => track.readyState === "live").length,
  );

test("lasciando la pagina mentre si registra, al ritorno si può registrare di nuovo", async ({ browser }) => {
  const { anna } = await connectPair(browser, "torno");
  await openChannel(anna, "Luca");

  await anna.getByRole("button", { name: "Registra" }).click();
  await expect(anna.getByRole("button", { name: "Ferma e invia" })).toBeVisible();

  await anna.getByRole("link", { name: "Le tue persone" }).click();
  await expect(anna).toHaveURL(/\/$/);
  await anna.getByRole("link", { name: "Luca" }).click();
  await expect(anna).toHaveURL(/\/persone\//);

  await expect(anna.getByRole("alert").filter({ hasText: "La registrazione si è interrotta" })).toBeVisible();
  await expect(anna.getByRole("region", { name: "Le tue lanterne" })).toHaveCount(0);

  await anna.getByRole("button", { name: "Registra" }).click();
  await expect(anna.getByRole("alert").filter({ hasText: "La registrazione si è interrotta" })).toHaveCount(0);
  await anna.waitForTimeout(1200);
  await anna.getByRole("button", { name: "Ferma e invia" }).click();
  await expect(anna.getByRole("region", { name: "Le tue lanterne" }).getByText("Vocale, meno di un minuto")).toBeVisible();
});

test("il permesso che arriva dopo aver lasciato la pagina non accende il microfono", async ({ browser }) => {
  const { anna } = await connectPair(browser, "tardi");
  await watchMicrophone(anna, { hold: true });
  await openChannel(anna, "Luca");
  await anna.reload();

  await anna.getByRole("button", { name: "Registra" }).click();
  await expect
    .poll(() => anna.evaluate(() => typeof (window as unknown as { grantMic?: () => void }).grantMic))
    .toBe("function");

  await anna.getByRole("link", { name: "Le tue persone" }).click();
  await expect(anna).toHaveURL(/\/$/);
  await anna.evaluate(() => (window as unknown as { grantMic: () => void }).grantMic());

  await expect
    .poll(() => anna.evaluate(() => (window as unknown as { micStreams: MediaStream[] }).micStreams.length))
    .toBe(1);
  await expect.poll(() => liveMicTracks(anna)).toBe(0);
});

test("se la registrazione non riesce a partire il microfono si spegne", async ({ browser }) => {
  const { anna } = await connectPair(browser, "guasto");
  await watchMicrophone(anna, { hold: false });
  await anna.addInitScript(() => {
    MediaRecorder.prototype.start = () => {
      throw new DOMException("guasto", "NotSupportedError");
    };
  });
  await openChannel(anna, "Luca");
  await anna.reload();

  await anna.getByRole("button", { name: "Registra" }).click();
  await expect(anna.getByRole("alert").filter({ hasText: "Il microfono non risponde" })).toBeVisible();
  await expect(anna.getByRole("button", { name: "Registra" })).toBeEnabled();
  await expect.poll(() => liveMicTracks(anna)).toBe(0);
});

test("lasciando la pagina il vocale smette di suonare", async ({ browser }) => {
  const { anna } = await connectPair(browser, "silenzio");
  await openChannel(anna, "Luca");

  await anna.getByRole("button", { name: "Registra" }).click();
  await anna.waitForTimeout(1200);
  await anna.getByRole("button", { name: "Ferma e invia" }).click();
  const mine = anna.getByRole("region", { name: "Le tue lanterne" });
  await mine.getByRole("button", { name: /^Riascolta/ }).click();

  const audio = anna.locator("audio");
  await expect(audio).toHaveAttribute("src", /X-Amz-Signature/);
  // In loop: un vocale breve, finendo da solo, sembrerebbe fermato anche senza la correzione.
  await audio.evaluate(async (el: HTMLAudioElement) => {
    el.loop = true;
    await el.play();
  });
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);

  await anna.getByRole("link", { name: "Le tue persone" }).click();
  await expect(anna).toHaveURL(/\/$/);
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
});

test("una foto arriva ricompressa e senza EXIF", async ({ browser }) => {
  const FIXTURE = "e2e/fixtures/photo-exif.jpg";
  expect(readFileSync(FIXTURE).toString("latin1")).toContain("Exif");

  const { anna, luca } = await connectPair(browser, "foto");
  const channel = await openChannel(anna, "Luca");
  await anna.getByLabel("Aggiungi una foto").setInputFiles(FIXTURE);

  const mine = anna.getByRole("region", { name: "Le tue lanterne" });
  await expect(mine.getByText("Foto", { exact: true })).toBeVisible();

  await setClockOffset(luca, offsetToArrival());
  await luca.goto(channel);
  const arrived = luca.getByRole("region", { name: "Arrivate" });
  await arrived.getByRole("button", { name: /^Apri: Foto di Anna/ }).click();
  const image = arrived.getByRole("img", { name: /^Foto di Anna/ });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2048);
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(1024);

  const res = await luca.request.get((await image.getAttribute("src"))!);
  const bytes = await res.body();
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(bytes.toString("latin1")).not.toContain("Exif");
  expect(bytes.toString("latin1")).not.toContain("GPS-LANTERNE-TEST");
});

test("un file che non è un'immagine dà un messaggio calmo", async ({ browser }) => {
  const { anna } = await connectPair(browser, "nonfoto");
  await openChannel(anna, "Luca");
  await anna.getByLabel("Aggiungi una foto").setInputFiles("e2e/fixtures/not-a-photo.txt");
  await expect(anna.getByRole("alert").filter({ hasText: "non si riesce ad aprire" })).toBeVisible();
  await expect(anna.getByRole("region", { name: "Le tue lanterne" })).toHaveCount(0);
});
