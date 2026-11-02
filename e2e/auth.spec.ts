import { expect, test } from "@playwright/test";
import { loginWithMagicLink } from "./helpers";

test("nuovo utente entra con magic link e completa l'onboarding", async ({ page }) => {
  await loginWithMagicLink(page, "anna@test.local");
  await expect(page).toHaveURL(/\/benvenuto$/);

  await page.getByLabel("Nome").fill("Anna");
  await page.getByLabel("ambra").check();
  await page.getByLabel("Fuso orario").selectOption("Europe/Rome");
  await page.getByRole("button", { name: "Continua" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Le tue persone" })).toBeVisible();
});
