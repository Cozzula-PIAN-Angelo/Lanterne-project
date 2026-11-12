// Genera i PNG delle icone da public/icon.svg. Una tantum: i PNG si committano.
// Uso: pnpm tsx scripts/icons.ts
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const ICONS = [
  { file: "public/icon-192.png", size: 192, maskable: false },
  { file: "public/icon-512.png", size: 512, maskable: false },
  { file: "public/icon-maskable-512.png", size: 512, maskable: true },
];

async function main() {
  const svg = await readFile("public/icon.svg", "utf8");
  const browser = await chromium.launch();
  try {
    for (const { file, size, maskable } of ICONS) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
      await page.evaluate(
        ({ size, maskable }) => {
          const icon = document.querySelector("svg")!;
          icon.setAttribute("width", String(size));
          icon.setAttribute("height", String(size));
          icon.style.display = "block";
          // Android ritaglia da sé le maskable: lo sfondo deve arrivare fino agli angoli.
          if (maskable) document.querySelector("#sfondo")!.setAttribute("rx", "0");
        },
        { size, maskable },
      );
      await page.screenshot({ path: file, omitBackground: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
