import { expect, test, type Page } from "@playwright/test";
import SunCalc from "suncalc";
import { computeRevealAt } from "@/lib/time/lantern-times";
import { localDateOf, localInstant } from "@/lib/time/reveal-time";
import { closeContexts, connectPair, openLantern, resetAuthRateLimit, setClockOffset } from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TESTO = "stasera si vede il lago";

async function openChannel(page: Page, partner: string) {
  await page.goto("/");
  await page.getByRole("link", { name: partner }).click();
  await expect(page).toHaveURL(/\/persone\//);
  await expect(page.getByRole("region", { name: "Il lago" })).toBeVisible();
  return page.url();
}

async function leaveText(page: Page, text: string) {
  await page.getByLabel("La tua lanterna").fill(text);
  await page.getByRole("button", { name: "Lascia la lanterna" }).click();
  await expect(page.getByLabel("La tua lanterna")).toHaveValue("");
}

/** Lo spostamento che porta l'orologio del server a `beforeMs` prima delle 21:30 di New York. */
function offsetBeforeArrival(beforeMs: number) {
  const revealAt = computeRevealAt(
    { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null },
    "America/New_York",
    new Date(Date.now()),
  );
  return revealAt.getTime() - Date.now() - beforeMs;
}

test("il lago segue il cielo e la pagina aperta vede arrivare le lanterne", async ({ browser }) => {
  test.setTimeout(90_000);
  const { anna, luca } = await connectPair(browser, "lago");
  const channel = await openChannel(anna, "Luca");
  await leaveText(anna, TESTO);
  const annaLantern = anna.getByRole("list", { name: "Le tue lanterne" }).getByRole("button", { name: /^Testo di Anna/ });
  await expect(annaLantern).toBeVisible();

  const lake = luca.getByRole("region", { name: "Il lago" });
  const arrived = luca.getByRole("list", { name: "Arrivate" });

  // Di giorno il lago è chiaro e non è arrivato niente.
  await setClockOffset(luca, offsetBeforeArrival(2 * HOUR));
  await luca.goto(channel);
  await expect(lake).toHaveAttribute("data-phase", "day");
  await expect(arrived).toHaveCount(0);

  // Mezz'ora prima il cielo si scalda.
  await setClockOffset(luca, offsetBeforeArrival(30 * MINUTE));
  await luca.reload();
  await expect(lake).toHaveAttribute("data-phase", "sunset");

  // Pochi secondi prima (con margine per un server lento): la pagina resta aperta e la sera
  // arriva da sola, con la lanterna.
  await setClockOffset(luca, offsetBeforeArrival(12_000));
  await luca.reload();
  await expect(lake).toHaveAttribute("data-phase", "sunset");
  await expect(lake).toHaveAttribute("data-phase", "night", { timeout: 30_000 });
  await expect(arrived.getByRole("button", { name: /^Testo di Anna/ })).toBeVisible({ timeout: 30_000 });

  const panel = await openLantern(luca, "Arrivate", /^Testo di Anna/);
  await expect(panel.getByText(TESTO)).toBeVisible();
  await expect(panel.getByRole("button", { name: "💛" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Conserva" })).toBeVisible();

  // Le proprie lanterne si accendono nell'ultima ora prima della partenza.
  await setClockOffset(anna, offsetBeforeArrival(30 * MINUTE));
  await anna.reload();
  await expect(annaLantern).toHaveAttribute("data-lit", "true");
  await setClockOffset(anna, offsetBeforeArrival(2 * HOUR));
  await anna.reload();
  await expect(annaLantern).toHaveAttribute("data-lit", "false");
});

test("con meno movimento le lanterne stanno ferme in fila", async ({ browser }) => {
  const { anna } = await connectPair(browser, "fermi");
  await anna.emulateMedia({ reducedMotion: "reduce" });
  await openChannel(anna, "Luca");

  await leaveText(anna, "la prima");
  await anna.getByRole("button", { name: "ti penso" }).click();
  const buttons = anna.getByRole("list", { name: "Le tue lanterne" }).getByRole("button");
  await expect(buttons).toHaveCount(2);
  await leaveText(anna, "la terza, un po' più lunga delle altre");
  await expect(buttons).toHaveCount(3);

  await expect(async () => {
    const boxes = await Promise.all((await buttons.all()).map((b) => b.boundingBox()));
    const [first, second, third] = boxes.map((box) => box!);
    expect(second.y).toBe(first.y);
    expect(third.y).toBe(first.y);
    expect(second.x).toBeGreaterThan(first.x);
    expect(third.x).toBeGreaterThan(second.x);
  }).toPass();

  for (const button of await buttons.all()) {
    expect(await button.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  }
});

test("ogni lanterna ha un'etichetta leggibile", async ({ browser }) => {
  test.setTimeout(90_000);
  const { anna, luca } = await connectPair(browser, "etichette");
  const channel = await openChannel(anna, "Luca");
  const mine = anna.getByRole("list", { name: "Le tue lanterne" });

  await anna.getByRole("button", { name: "Registra" }).click();
  await expect(anna.getByRole("button", { name: "Ferma e invia" })).toBeVisible();
  await anna.waitForTimeout(1200);
  await anna.getByRole("button", { name: "Ferma e invia" }).click();
  await expect(mine.getByRole("button", { name: /^Vocale di Anna, / })).toBeVisible();

  await anna.getByLabel("Aggiungi una foto").setInputFiles("e2e/fixtures/photo-exif.jpg");
  await expect(mine.getByRole("button", { name: /^Foto di Anna, / })).toBeVisible();

  await leaveText(anna, "anche un testo");
  await expect(mine.getByRole("button", { name: /^Testo di Anna, / })).toBeVisible();

  // Dall'altra riva, dopo l'arrivo, hanno lo stesso nome.
  await setClockOffset(luca, offsetBeforeArrival(-MINUTE));
  await luca.goto(channel);
  const arrived = luca.getByRole("list", { name: "Arrivate" });
  await expect(arrived.getByRole("button", { name: /^Vocale di Anna, / })).toBeVisible();
  await expect(arrived.getByRole("button", { name: /^Foto di Anna, / })).toBeVisible();
  await expect(arrived.getByRole("button", { name: /^Testo di Anna, / })).toBeVisible();
});

test("con la posizione il cielo segue il tramonto vero, e la posizione non lascia il telefono", async ({ browser }) => {
  test.setTimeout(90_000);
  const { anna } = await connectPair(browser, "tramonto");
  const context = anna.context();

  // Da qui in poi ogni richiesta di ogni pagina del contesto viene registrata.
  const requests: string[] = [];
  context.on("request", (request) => requests.push(`${request.url()} ${request.postData() ?? ""}`));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.9028, longitude: 12.4964 });

  await anna.goto("/impostazioni");
  // La posizione arriva dopo il tocco: si clicca e si aspetta il messaggio, senza pretendere lo stato subito.
  await anna.getByLabel("Usa la mia posizione per il cielo").click();
  await expect(anna.getByText("Fatto: ora il cielo segue il tramonto vero.")).toBeVisible();
  expect(await anna.evaluate(() => localStorage.getItem("lanterne:sky-location"))).toBe('{"lat":41.9,"lng":12.5}');

  // A metà tra il tramonto reale di Roma e l'apertura delle 21:30: senza posizione sarebbe ancora giorno.
  const tz = "Europe/Rome";
  const nextArrival = computeRevealAt(
    { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null },
    tz,
    new Date(Date.now()),
  );
  const noon = localInstant(localDateOf(new Date(nextArrival.getTime() - MINUTE), tz), "12:00", tz);
  const sunset = SunCalc.getTimes(noon, 41.9028, 12.4964).sunset;
  const middle = (sunset.getTime() + nextArrival.getTime()) / 2;
  await setClockOffset(anna, middle - Date.now());

  const channel = await openChannel(anna, "Luca");
  const lake = anna.getByRole("region", { name: "Il lago" });
  await expect(lake).toHaveAttribute("data-phase", "dusk");

  // Spenta l'opzione, la posizione sparisce e il cielo torna a quello senza.
  await anna.goto("/impostazioni");
  const toggle = anna.getByLabel("Usa la mia posizione per il cielo");
  await expect(toggle).toBeChecked(); // dopo l'idratazione
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  expect(await anna.evaluate(() => localStorage.getItem("lanterne:sky-location"))).toBeNull();
  await anna.goto(channel);
  await expect(lake).toHaveAttribute("data-phase", "day");

  // Il test calcola il tramonto dalle coordinate non arrotondate; il margine del punto medio (ore, non minuti) rende
  // sicuro il confronto con la fase del lago, che usa quelle arrotondate. I numeri sono cercati come numeri interi
  // a sé, per non confonderli con id, date o byte di altro tipo.
  const coordinate = /(^|[^\d.])(41\.9\d*|12\.[45]\d*)(?![\d.])/;
  for (const request of requests) expect(request).not.toMatch(coordinate);
});
