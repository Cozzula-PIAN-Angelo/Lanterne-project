import { expect, type Page } from "@playwright/test";

export const MAILPIT = "http://localhost:8025";
export const DEMO_PASSWORD = "lanterne-demo";

type MailpitList = { messages: { ID: string }[] };

/** Chiede il magic link da /accedi, lo legge da Mailpit e lo apre. */
export async function loginWithMagicLink(page: Page, email: string) {
  await page.goto("/accedi");
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
