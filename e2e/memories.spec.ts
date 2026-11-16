import { expect, test } from "@playwright/test";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { computeRevealAt } from "@/lib/time/lantern-times";
import { closeContexts, connectPair, openLantern, resetAuthRateLimit, setClockOffset } from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

const TESTO = "un pensiero da tenere";

test("una lanterna conservata si ritrova nei Ricordi, anche dopo la chiusura", async ({ browser }) => {
  const { anna, luca } = await connectPair(browser, "ricordi");

  await anna.goto("/");
  await anna.getByRole("link", { name: "Luca" }).click();
  await anna.getByLabel("La tua lanterna").fill(TESTO);
  await anna.getByRole("button", { name: "Lascia la lanterna" }).click();
  await openLantern(anna, "Le tue lanterne", /^Testo di Anna/);

  // Un minuto dopo l'apertura, nell'ora di New York.
  const revealAt = computeRevealAt(
    { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null },
    "America/New_York",
    new Date(Date.now()),
  );
  await setClockOffset(luca, revealAt.getTime() - Date.now() + 60_000);
  await luca.goto("/");
  await luca.getByRole("link", { name: "Anna" }).click();
  const panel = await openLantern(luca, "Arrivate", /^Testo di Anna/);
  await panel.getByRole("button", { name: "Conserva" }).click();
  await expect(panel.getByText("Conservata")).toBeVisible();

  // La sera è il giorno di New York un minuto prima dell'arrivo.
  const evening = format(new TZDate(revealAt.getTime() - 60_000, "America/New_York"), "d MMMM", { locale: it });

  await luca.getByRole("link", { name: "Ricordi (1)" }).click();
  await expect(luca.getByRole("heading", { name: "Ricordi con Anna" })).toBeVisible();
  await expect(luca.getByRole("heading", { name: evening, level: 2 })).toBeVisible();
  await expect(luca.getByText(TESTO, { exact: true }).filter({ visible: true })).toBeVisible();

  // Luca chiude la connessione: i ricordi restano, dalla home.
  await luca.goto("/");
  await luca.getByRole("link", { name: "Anna" }).click();
  await luca.getByRole("button", { name: "Chiudi la connessione" }).click();
  await luca.getByRole("button", { name: "Sì, chiudi" }).click();
  await expect(luca).toHaveURL(/\/$/);
  await luca.getByRole("region", { name: "Connessioni chiuse" }).getByRole("link", { name: "Anna" }).click();
  await expect(luca).toHaveURL(/\/ricordi$/);
  await expect(luca.getByRole("heading", { name: "Ricordi con Anna" })).toBeVisible();
  await expect(luca.getByText(TESTO, { exact: true }).filter({ visible: true })).toBeVisible();
});
