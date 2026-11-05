import { expect, test } from "@playwright/test";
import { completeOnboarding, loginWithMagicLink } from "./helpers";

test("nuovo utente entra con magic link e completa l'onboarding", async ({ page }) => {
  await loginWithMagicLink(page, "anna@test.local");
  await expect(page).toHaveURL(/\/benvenuto$/);

  await completeOnboarding(page, "Anna", "Europe/Rome");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Le tue persone" })).toBeVisible();
});
