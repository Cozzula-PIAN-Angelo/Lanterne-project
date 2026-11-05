import { expect, test } from "@playwright/test";
import { localDateOf, localInstant } from "@/lib/time/reveal-time";
import {
  completeOnboarding,
  connectPair,
  createInviteLink,
  loginWithMagicLink,
  closeContexts,
  resetAuthRateLimit,
} from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

/** Quanto spostare l'orologio per essere alle 10:00 di Roma di oggi: il test non dipende dall'ora in cui gira. */
function offsetToRomeMorning() {
  const now = new Date(Date.now());
  return localInstant(localDateOf(now, "Europe/Rome"), "10:00", "Europe/Rome").getTime() - now.getTime();
}

test("un cambio d'orario vale da domani e un blocco chiude tutto", async ({ browser }) => {
  const { anna, luca } = await connectPair(browser, "gestione", offsetToRomeMorning());

  // Anna propone le 22:00.
  await anna.goto("/");
  await anna.getByRole("link", { name: "Luca" }).click();
  await anna.getByRole("button", { name: "Cambia orario" }).click();
  await expect(anna.getByText("Il nuovo orario varrà da domani, se Luca accetta")).toBeVisible();
  await anna.getByLabel("Orario").filter({ visible: true }).selectOption("22:00");
  await anna.getByRole("button", { name: "Proponi", exact: true }).click();
  await expect(anna.getByText("Hai proposto le 22:00")).toBeVisible();

  // Luca accetta dal canale.
  await luca.goto("/");
  await luca.getByRole("link", { name: "Anna" }).click();
  await expect(luca.getByText("Anna propone le 22:00")).toBeVisible();
  await luca.getByRole("button", { name: "Accetta" }).click();
  await expect(luca.getByText("Anna propone le 22:00")).toHaveCount(0);
  await expect(luca).toHaveURL(/\/persone\//);

  // Stasera vale ancora il vecchio orario.
  await anna.goto("/");
  await expect(anna.getByText("Le lanterne arrivano stasera alle 21:30")).toBeVisible();

  // Anna blocca Luca: la connessione sparisce per entrambi.
  await anna.getByRole("link", { name: "Luca" }).click();
  await anna.getByRole("button", { name: "Blocca" }).click();
  await expect(
    anna.getByText("Luca non potrà più invitarti e le tue lanterne che ha conservato verranno eliminate."),
  ).toBeVisible();
  await anna.getByRole("button", { name: "Sì, blocca" }).click();
  await expect(anna).toHaveURL(/\/$/);
  await expect(anna.getByRole("link", { name: "Luca" })).toHaveCount(0);

  await luca.goto("/");
  await expect(luca.getByRole("link", { name: "Anna" })).toHaveCount(0);

  // Un nuovo invito di Luca, per Anna, non è valido.
  const link = await createInviteLink(luca, "21:00");
  await anna.goto(link);
  await expect(anna.getByText("Questo invito non è valido.")).toBeVisible();

  // Dalle impostazioni Anna può sbloccarlo.
  await anna.goto("/impostazioni");
  const blocked = anna.getByRole("region", { name: "Persone bloccate" });
  await expect(blocked.getByText("Luca")).toBeVisible();
  await blocked.getByRole("button", { name: "Sblocca" }).click();
  await expect(blocked.getByText("Luca")).toHaveCount(0);
  await anna.goto(link);
  await expect(anna.getByRole("heading", { name: "Luca ti invita" })).toBeVisible();
});

test("chiudere una connessione chiede conferma e libera il posto", async ({ browser }) => {
  const { anna, luca } = await connectPair(browser, "chiusura");
  await luca.getByRole("link", { name: "Anna" }).click();
  await expect(luca).toHaveURL(/\/persone\//);
  const channel = luca.url();

  await luca.getByRole("button", { name: "Chiudi la connessione" }).click();
  await expect(luca.getByText("Le lanterne non ancora arrivate verranno eliminate. I ricordi restano.")).toBeVisible();
  await luca.getByRole("button", { name: "Annulla" }).click();
  await expect(luca.getByRole("button", { name: "Sì, chiudi" })).toHaveCount(0);

  await luca.getByRole("button", { name: "Chiudi la connessione" }).click();
  await luca.getByRole("button", { name: "Sì, chiudi" }).click();
  await expect(luca).toHaveURL(/\/$/);
  await expect(luca.getByRole("link", { name: "Invita qualcuno" })).toHaveCount(5);

  await anna.goto(channel);
  await expect(anna.getByText("Questa connessione è chiusa.")).toBeVisible();
  await expect(anna.getByLabel("La tua lanterna")).toHaveCount(0);
  await expect(anna.getByRole("button", { name: "Cambia orario" })).toHaveCount(0);
});

test("il banner propone il fuso del dispositivo e ricorda il no", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  await loginWithMagicLink(page, "viaggio@test.local");
  await completeOnboarding(page, "Marta", "Europe/Rome");

  const banner = page.getByText("Sei a Tokyo? Aggiorno il tuo fuso orario?");
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "No" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Le tue persone" })).toBeVisible();
  await expect(banner).toHaveCount(0);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Sì" }).click();
  await expect(banner).toHaveCount(0);
  await page.goto("/impostazioni");
  await expect(page.getByLabel("Fuso orario")).toHaveValue("Asia/Tokyo");
  await expect(banner).toHaveCount(0);
});

test("le impostazioni salvano le scelte e si può uscire", async ({ page }) => {
  await loginWithMagicLink(page, "scelte@test.local");
  await completeOnboarding(page, "Nina", "Europe/Rome");
  await page.getByRole("link", { name: "Impostazioni" }).click();

  const saving = page.getByLabel("Permetti di conservare le mie lanterne");
  await expect(saving).toBeChecked();
  await expect(page.getByText("Vale per le lanterne che invierai da ora in poi")).toBeVisible();
  await saving.uncheck();
  await expect(saving).not.toBeChecked();
  await page.reload();
  await expect(saving).not.toBeChecked();

  await page.getByLabel("Nome").fill("Nina Rossi");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("status")).toHaveText("Salvato.");
  await page.reload();
  await expect(page.getByLabel("Nome")).toHaveValue("Nina Rossi");
  await expect(page.getByLabel("Fuso orario")).toHaveValue("Europe/Rome");

  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/accedi/);
  await page.goto("/impostazioni");
  await expect(page).toHaveURL(/\/accedi/);
});
