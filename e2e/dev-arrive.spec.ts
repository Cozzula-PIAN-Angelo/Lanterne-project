import { expect, test } from "@playwright/test";
import { closeContexts, connectPair, resetAuthRateLimit } from "./helpers";

test.beforeEach(resetAuthRateLimit);
test.afterEach(closeContexts);

test("il tasto dev fa arrivare subito la lanterna in attesa", async ({ browser }) => {
  const { anna, luca } = await connectPair(browser, "arrivo");
  await anna.goto("/");
  await anna.getByRole("link", { name: "Luca" }).click();
  await expect(anna).toHaveURL(/\/persone\//);
  await anna.getByLabel("La tua lanterna").fill("ci vediamo presto");
  await anna.getByRole("button", { name: "Lascia la lanterna" }).click();
  await expect(anna.getByLabel("La tua lanterna")).toHaveValue("");

  await luca.goto("/");
  await luca.getByRole("link", { name: "Anna" }).click();
  await expect(luca).toHaveURL(/\/persone\//);
  await luca.getByRole("button", { name: "Fai arrivare adesso" }).click();
  await expect(luca.getByText("Arrivate adesso: 1 lanterna")).toBeVisible();
  await expect(
    luca.getByRole("list", { name: "Arrivate" }).getByRole("button", { name: /^Testo di Anna/, includeHidden: false }),
  ).toBeVisible();
});
