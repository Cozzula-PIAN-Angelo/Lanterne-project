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
