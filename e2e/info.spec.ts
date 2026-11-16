import { expect, test } from "@playwright/test";
import { closeContexts, loginWithMagicLink, completeOnboarding, resetAuthRateLimit } from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

test("Privacy e Se stai male si leggono senza account", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/accedi");
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Se stai male" })).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(page.getByText(/resta sul telefono/)).toBeVisible();
  await expect(page.getByText(/6 del mattino/).first()).toBeVisible();

  await page.goto("/se-stai-male");
  await expect(page.getByRole("link", { name: "112" })).toHaveAttribute("href", "tel:112");
  await expect(page.getByRole("link", { name: /02 2327 2327/ })).toHaveAttribute("href", /^tel:/);
  await expect(page.getByRole("link", { name: /findahelpline\.com/ })).toHaveAttribute(
    "href",
    "https://findahelpline.com",
  );
  await context.close();
});

test("le Impostazioni portano alle due pagine", async ({ page }) => {
  await loginWithMagicLink(page, "info@test.local");
  await completeOnboarding(page, "Info", "Europe/Rome");
  await page.goto("/impostazioni");
  await page.getByRole("link", { name: "Privacy" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goto("/impostazioni");
  await page.getByRole("link", { name: "Se stai male" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/se-stai-male$/);
});
