import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function render(size, file, svg) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
    { waitUntil: "load" }
  );
  await page.screenshot({
    path: path.join(dir, file),
    type: "png",
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await page.close();
}

const full = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");
await render(128, "icon128.png", full);
await render(48, "icon48.png", full.replace('width="128" height="128"', 'width="48" height="48"'));

const small = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect width="16" height="16" rx="4" fill="#111111"/>
  <rect x="6" y="3" width="4" height="6" rx="2" fill="#ffffff"/>
  <path d="M4.5 8a3.5 3.5 0 0 0 7 0" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M8 11.5V13.5M6 13.5h4" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
await render(16, "icon16.png", small);

await browser.close();
console.log("wrote icons");
