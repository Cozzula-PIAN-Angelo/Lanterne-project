import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

// Con cacheComponents le pagine già visitate restano nel DOM, nascoste da <Activity>:
// dopo una navigazione client i selettori di testo vanno filtrati con { visible: true }.

export const MAILPIT = "http://localhost:8025";
export const DEMO_PASSWORD = "lanterne-demo";

type MailpitList = { messages: { ID: string }[] };

/** Chiede il magic link da /accedi, lo legge da Mailpit e lo apre. */
export async function loginWithMagicLink(page: Page, email: string) {
  await page.goto("/accedi");
  await requestAndOpenMagicLink(page, email);
}

/** Dal form di accesso già aperto: chiede il link, lo legge da Mailpit e lo apre. */
export async function requestAndOpenMagicLink(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Mandami il link" }).click();
  await expect(page.getByText("Ti abbiamo mandato un link")).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(async () => {
      const search = `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
      const list = (await (await fetch(search)).json()) as MailpitList;
      const latest = list.messages[0];
      if (!latest) return undefined;
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json()) as {
        Text: string;
      };
      link = message.Text.match(/https?:\/\/\S+/)?.[0];
      return link;
    })
    .toBeTruthy();
  await page.goto(link!);
}

/** Login demo con email e password (il form demo usa la stessa API). */
export async function loginAsDemo(page: Page, email: string) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password: DEMO_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  await page.goto("/");
}

/** Completa l'onboarding da /benvenuto; l'app poi prosegue da sola. */
export async function completeOnboarding(page: Page, name: string, timezone: string) {
  await expect(page).toHaveURL(/\/benvenuto/);
  // Le opzioni del fuso esistono solo nel browser: un valore vuol dire che la pagina è idratata.
  await expect(page.getByLabel("Fuso orario")).not.toHaveValue("");
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("ambra").check();
  await page.getByLabel("Fuso orario").selectOption(timezone);
  await page.getByRole("button", { name: "Continua" }).click();
  // Senza questa attesa, una navigazione subito dopo può interrompere il salvataggio del profilo.
  await expect(page).not.toHaveURL(/\/benvenuto/);
}

/** Crea un invito dall'interfaccia e restituisce il link da condividere. */
export async function createInviteLink(page: Page, revealTime: string): Promise<string> {
  await page.goto("/invita");
  await page.getByLabel("Orario").selectOption(revealTime);
  await page.getByRole("button", { name: "Crea il link" }).click();
  const field = page.getByLabel("Link dell'invito");
  await expect(field).toBeVisible();
  return field.inputValue();
}

/** Apre un invito da non loggati: login col magic link e onboarding riportano all'invito. */
export async function openInviteAsNewUser(
  page: Page,
  link: string,
  user: { email: string; name: string; timezone: string },
) {
  await page.goto(link);
  await expect(page).toHaveURL(/\/accedi\?next=/);
  await requestAndOpenMagicLink(page, user.email);
  await completeOnboarding(page, user.name, user.timezone);
  await expect(page).toHaveURL(link);
}

/**
 * Azzera il limite di Better Auth (5 magic link al minuto per IP): qui tutti arrivano da localhost.
 * Da usare in un beforeEach nei test che fanno più login.
 */
export async function resetAuthRateLimit() {
  const client = postgres(process.env.DATABASE_URL_E2E ?? "", { max: 1, onnotice: () => {} });
  try {
    await client`DELETE FROM "rate_limit"`;
  } finally {
    await client.end();
  }
}

/** Anna (Roma) e Luca (New York), nuovi e collegati da un invito alle 21:30. `tag` rende unica l'email. */
export async function connectPair(browser: Browser, tag: string, clockOffsetMs?: number) {
  const anna = await (await browser.newContext()).newPage();
  if (clockOffsetMs !== undefined) await setClockOffset(anna, clockOffsetMs);
  await loginWithMagicLink(anna, `anna.${tag}@test.local`);
  await completeOnboarding(anna, "Anna", "Europe/Rome");
  const link = await createInviteLink(anna, "21:30");

  const luca = await (await browser.newContext()).newPage();
  if (clockOffsetMs !== undefined) await setClockOffset(luca, clockOffsetMs);
  await openInviteAsNewUser(luca, link, {
    email: `luca.${tag}@test.local`,
    name: "Luca",
    timezone: "America/New_York",
  });
  await luca.getByRole("button", { name: "Accetta" }).click();
  await expect(luca).toHaveURL(/\/$/);
  return { anna, luca };
}

/** Sposta l'orologio del server per questo browser (cookie di sviluppo). */
export async function setClockOffset(page: Page, offsetMs: number) {
  await page.context().addCookies([
    { name: "lanterne-dev-offset", value: String(offsetMs), url: test.info().project.use.baseURL! },
  ]);
}

/** Per un afterEach: chiude i contesti aperti dal test, che altrimenti restano vivi per tutta la suite. */
export async function closeContexts({ browser }: { browser: Browser }) {
  await Promise.all(browser.contexts().map((context) => context.close()));
}
