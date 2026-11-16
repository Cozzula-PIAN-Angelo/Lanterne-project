import { expect, test } from "@playwright/test";
import { computeRevealAt } from "@/lib/time/lantern-times";
import {
  completeOnboarding,
  connectPair,
  loginWithMagicLink,
  closeContexts,
  openLantern,
  resetAuthRateLimit,
  setClockOffset,
} from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

const TRAMONTO = "il tramonto dal tram oggi era assurdo";

test("le lanterne restano sigillate fino all'orario, poi si leggono e si conservano", async ({ browser }) => {
  const { anna, luca } = await connectPair(browser, "canale");

  // Anna lascia un testo e un pensiero.
  await anna.goto("/");
  await anna.getByRole("link", { name: "Luca" }).click();
  await expect(anna).toHaveURL(/\/persone\//);
  const channel = anna.url();

  await anna.getByLabel("La tua lanterna").fill(TRAMONTO);
  await anna.getByRole("button", { name: "Lascia la lanterna" }).click();
  let panel = await openLantern(anna, "Le tue lanterne", /^Testo di Anna/);
  await expect(panel.getByText(TRAMONTO)).toBeVisible();
  await expect(anna.getByLabel("La tua lanterna")).toHaveValue("");
  await expect(panel.getByRole("button", { name: "Elimina" })).toHaveCount(1);

  await anna.getByRole("button", { name: "ti penso" }).click();
  panel = await openLantern(anna, "Le tue lanterne", /^Pensiero di Anna/);
  await expect(panel.getByText("ti penso")).toBeVisible();
  await expect(anna.getByText(/^partono .*, le 21:30 di Luca$/)).toBeVisible();
  await expect(anna.getByText(/^tra /)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Elimina" })).toHaveCount(1);

  // Prima dell'arrivo Luca non vede niente.
  await luca.goto(channel);
  await expect(luca.getByRole("heading", { name: "Anna" })).toBeVisible();
  await expect(luca.getByRole("list", { name: "Arrivate" })).toHaveCount(0);
  await expect(luca.getByText(TRAMONTO)).toHaveCount(0);

  // Un minuto dopo l'apertura, nell'ora di New York.
  const revealAt = computeRevealAt(
    { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null },
    "America/New_York",
    new Date(Date.now()),
  );
  const offset = revealAt.getTime() - Date.now() + 60_000;
  await setClockOffset(luca, offset);
  await luca.reload();

  const thought = await openLantern(luca, "Arrivate", /^Pensiero di Anna/);
  await expect(thought.getByText("ti penso")).toBeVisible();
  const text = await openLantern(luca, "Arrivate", /^Testo di Anna/);
  await expect(text.getByText(TRAMONTO)).toBeVisible();
  await text.getByRole("button", { name: "💛" }).click();
  await expect(text.getByRole("button", { name: "💛" })).toHaveAttribute("aria-pressed", "true");
  await text.getByRole("button", { name: "Conserva" }).click();
  await expect(text.getByText("Conservata")).toBeVisible();
  await luca.getByRole("link", { name: "Ricordi (1)" }).click();
  await expect(luca.getByRole("heading", { name: "Ricordi con Anna" })).toBeVisible();
  await expect(luca.getByText(TRAMONTO, { exact: true }).filter({ visible: true })).toBeVisible();

  // Anna, con lo stesso orologio, vede la lanterna aperta.
  await setClockOffset(anna, offset);
  await anna.reload();
  const opened = await openLantern(anna, "Le tue lanterne", /^Testo di Anna/);
  await expect(opened.getByText(TRAMONTO)).toBeVisible();
  await expect(opened.getByText("Luca l'ha conservata")).toBeVisible();
  await expect(opened.getByText("💛")).toBeVisible();
  await expect(opened.getByRole("button", { name: "Elimina" })).toHaveCount(0);
  const openedThought = await openLantern(anna, "Le tue lanterne", /^Pensiero di Anna/);
  await expect(openedThought.getByText("ti penso")).toBeVisible();
  await expect(openedThought.getByRole("button", { name: "Elimina" })).toHaveCount(0);

  // Per un estraneo il canale non esiste: stessa risposta di un id inventato.
  const sara = await (await browser.newContext()).newPage();
  await loginWithMagicLink(sara, "sara.canale@test.local");
  await completeOnboarding(sara, "Sara", "Europe/Rome");
  await expect(sara.getByRole("heading", { name: "Le tue persone" })).toBeVisible();
  const other = await sara.goto(channel);
  await expect(sara.getByRole("heading", { name: "Qui non c'è niente." })).toBeVisible();
  await expect(sara.getByText(TRAMONTO)).toHaveCount(0);
  const missing = await sara.goto("/persone/non-esiste");
  await expect(sara.getByRole("heading", { name: "Qui non c'è niente." })).toBeVisible();
  expect(other?.status()).toBe(missing?.status());
});

test("una lanterna sigillata si può eliminare", async ({ browser }) => {
  const { anna } = await connectPair(browser, "elimina");
  await anna.goto("/");
  await anna.getByRole("link", { name: "Luca" }).click();

  await anna.getByLabel("La tua lanterna").fill("ci ho ripensato");
  await anna.getByRole("button", { name: "Lascia la lanterna" }).click();
  const panel = await openLantern(anna, "Le tue lanterne", /^Testo di Anna/);
  await expect(panel.getByText("ci ho ripensato")).toBeVisible();

  await panel.getByRole("button", { name: "Elimina" }).click();
  await expect(anna.getByText("ci ho ripensato")).toHaveCount(0);
});
