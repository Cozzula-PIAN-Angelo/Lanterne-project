import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  createInviteLink,
  loginWithMagicLink,
  openInviteAsNewUser,
  resetAuthRateLimit,
} from "./helpers";

test.beforeEach(resetAuthRateLimit);

test("un invito collega due persone e si può usare una volta sola", async ({ browser }) => {
  const anna = await (await browser.newContext()).newPage();
  await loginWithMagicLink(anna, "anna.invito@test.local");
  await completeOnboarding(anna, "Anna", "Europe/Rome");
  await expect(anna.getByRole("link", { name: "Invita qualcuno" })).toHaveCount(5);

  const link = await createInviteLink(anna, "21:30");
  expect(link).toMatch(/\/invito\/[\w-]{22}$/);
  await expect(anna.getByText("valido 7 giorni")).toBeVisible();

  const luca = await (await browser.newContext()).newPage();
  await openInviteAsNewUser(luca, link, {
    email: "luca.invito@test.local",
    name: "Luca",
    timezone: "America/New_York",
  });
  await expect(luca.getByRole("heading", { name: "Anna ti invita: le lanterne arrivano alle 21:30" })).toBeVisible();
  await luca.getByRole("button", { name: "Accetta" }).click();
  await expect(luca).toHaveURL(/\/$/);
  await expect(luca.getByText("Anna", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(luca.getByText(/alle 21:30/).filter({ visible: true })).toBeVisible();
  await expect(luca.getByRole("link", { name: "Invita qualcuno" })).toHaveCount(4);

  const sara = await (await browser.newContext()).newPage();
  await openInviteAsNewUser(sara, link, {
    email: "sara.invito@test.local",
    name: "Sara",
    timezone: "Europe/Rome",
  });
  await expect(sara.getByText("Questo invito è già stato usato.")).toBeVisible();
});

test("una controproposta resta in attesa finché l'altro non accetta", async ({ browser }) => {
  const anna = await (await browser.newContext()).newPage();
  await loginWithMagicLink(anna, "anna.proposta@test.local");
  await completeOnboarding(anna, "Anna", "Europe/Rome");
  const link = await createInviteLink(anna, "21:30");

  const luca = await (await browser.newContext()).newPage();
  await openInviteAsNewUser(luca, link, {
    email: "luca.proposta@test.local",
    name: "Luca",
    timezone: "Europe/Rome",
  });
  await luca.getByRole("button", { name: "Proponi un altro orario" }).click();
  await luca.getByLabel("Orario").filter({ visible: true }).selectOption("00:00");
  await luca.getByRole("button", { name: "Proponi questo orario" }).click();

  await expect(luca).toHaveURL(/\/$/);
  await expect(luca.getByText("In attesa: proposta di mezzanotte")).toBeVisible();
  await expect(luca.getByRole("button", { name: "Accetta" })).toHaveCount(0);

  await anna.goto("/");
  await expect(anna.getByText("In attesa: proposta di mezzanotte")).toBeVisible();
  await anna.getByRole("button", { name: "Accetta" }).click();
  await expect(anna.getByText(/a mezzanotte/)).toBeVisible();
  await expect(anna.getByRole("button", { name: "Accetta" })).toHaveCount(0);
});
