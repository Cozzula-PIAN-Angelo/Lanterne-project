import { expect, test } from "@playwright/test";
import { computeRevealAt } from "@/lib/time/lantern-times";
import {
  completeOnboarding,
  connectPair,
  loginWithMagicLink,
  resetAuthRateLimit,
  setClockOffset,
} from "./helpers";

test.beforeEach(resetAuthRateLimit);

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
  const mine = anna.getByRole("region", { name: "Le tue lanterne" });
  await expect(mine.getByText(TRAMONTO)).toBeVisible();
  await expect(anna.getByLabel("La tua lanterna")).toHaveValue("");

  await anna.getByRole("button", { name: "ti penso" }).click();
  await expect(mine.getByText("ti penso")).toBeVisible();
  await expect(mine.getByText(/^partono .*, le 21:30 di Luca$/)).toBeVisible();
  await expect(mine.getByText(/^tra /)).toBeVisible();
  await expect(mine.getByRole("button", { name: "Elimina" })).toHaveCount(2);

  // Prima dell'arrivo Luca non vede niente.
  await luca.goto(channel);
  await expect(luca.getByRole("heading", { name: "Anna" })).toBeVisible();
  await expect(luca.getByRole("region", { name: "Arrivate" })).toHaveCount(0);
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

  const arrived = luca.getByRole("region", { name: "Arrivate" });
  await expect(arrived.getByText("ti penso")).toBeVisible();
  const text = arrived.getByRole("listitem").filter({ hasText: TRAMONTO });
  await text.getByRole("button", { name: "💛" }).click();
  await expect(text.getByRole("button", { name: "💛" })).toHaveAttribute("aria-pressed", "true");
  await text.getByRole("button", { name: "Conserva" }).click();
  await expect(text.getByText("Conservata")).toBeVisible();
  await expect(luca.getByRole("region", { name: "Ricordi" }).getByText(TRAMONTO)).toBeVisible();

  // Anna, con lo stesso orologio, vede la lanterna aperta.
  await setClockOffset(anna, offset);
  await anna.reload();
  const opened = mine.getByRole("listitem").filter({ hasText: TRAMONTO });
  await expect(opened.getByText("Luca l'ha conservata")).toBeVisible();
  await expect(opened.getByText("💛")).toBeVisible();
  await expect(mine.getByRole("button", { name: "Elimina" })).toHaveCount(0);

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
  const mine = anna.getByRole("region", { name: "Le tue lanterne" });
  await expect(mine.getByText("ci ho ripensato")).toBeVisible();

  await mine.getByRole("button", { name: "Elimina" }).click();
  await expect(anna.getByText("ci ho ripensato")).toHaveCount(0);
});
