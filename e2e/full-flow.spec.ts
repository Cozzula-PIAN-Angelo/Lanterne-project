import { expect, test, type Page } from "@playwright/test";
import { closeContexts, connectPair, resetAuthRateLimit } from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

const TESTO = "oggi ho pensato a quel treno";

/** Un salto in avanti col pannello: aspetta che l'ora simulata cambi davvero. */
async function jumpSixHours(page: Page) {
  const clock = page.getByTestId("dev-time");
  const before = await clock.textContent();
  await page.getByRole("button", { name: "+6 ore" }).click();
  await expect(clock).not.toHaveText(before ?? "");
}

test("il ciclo completo, col viaggio nel tempo", async ({ browser }) => {
  // Due persone nuove, in due fusi, collegate da un invito.
  const { anna, luca } = await connectPair(browser, "completo");

  // Anna lascia un testo e un pensiero.
  await anna.goto("/");
  await anna.getByRole("link", { name: "Luca" }).click();
  await expect(anna).toHaveURL(/\/persone\//);
  await anna.getByLabel("La tua lanterna").fill(TESTO);
  await anna.getByRole("button", { name: "Lascia la lanterna" }).click();
  const mine = anna.getByRole("region", { name: "Le tue lanterne" });
  await expect(mine.getByText(TESTO)).toBeVisible();
  await anna.getByRole("button", { name: "ti penso" }).click();
  await expect(mine.getByText("ti penso")).toBeVisible();

  // Luca va avanti a salti di 6 ore: la finestra di arrivo dura almeno 8 ore, non può saltarla.
  await luca.goto(anna.url());
  await expect(luca.getByRole("heading", { name: "Anna" })).toBeVisible();
  const arrived = luca.getByRole("region", { name: "Arrivate" });
  let jumps = 0;
  while ((await arrived.count()) === 0 && jumps < 5) {
    await jumpSixHours(luca);
    jumps++;
  }
  await expect(arrived.getByText("ti penso")).toBeVisible();

  // Luca reagisce e conserva.
  const text = arrived.getByRole("listitem").filter({ hasText: TESTO });
  await text.getByRole("button", { name: "💛" }).click();
  await expect(text.getByRole("button", { name: "💛" })).toHaveAttribute("aria-pressed", "true");
  await text.getByRole("button", { name: "Conserva" }).click();
  await expect(text.getByText("Conservata")).toBeVisible();

  // Anna raggiunge lo stesso momento e vede cosa è successo.
  for (let i = 0; i < jumps; i++) await jumpSixHours(anna);
  const opened = mine.getByRole("listitem").filter({ hasText: TESTO });
  await expect(opened.getByText("Luca l'ha conservata")).toBeVisible();
  await expect(opened.getByText("💛")).toBeVisible();

  // "Torna a ora" riporta tutto al presente: la lanterna è di nuovo sigillata.
  await anna.getByRole("button", { name: "Torna a ora" }).click();
  await expect(mine.getByRole("button", { name: "Elimina" })).toHaveCount(2);

  // Dopo la chiusura, chi ha conservato una lanterna ritrova il canale dalla home.
  await luca.getByRole("button", { name: "Chiudi la connessione" }).click();
  await luca.getByRole("button", { name: "Sì, chiudi" }).click();
  await expect(luca).toHaveURL(/\/$/);
  await luca.getByRole("region", { name: "Connessioni chiuse" }).getByRole("link", { name: "Anna" }).click();
  await expect(luca.getByRole("region", { name: "Ricordi" }).getByText(TESTO)).toBeVisible();
});
