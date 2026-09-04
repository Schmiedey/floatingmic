import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "screenshots");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

async function shot(file, width, height, name) {
  await page.setViewportSize({ width: width, height: height });
  await page.goto("http://127.0.0.1:8765/store/shots/" + file, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(out, name),
    type: "png",
    clip: { x: 0, y: 0, width: width, height: height },
  });
  console.log("wrote", name);
}

await shot("01-dictate.html", 1280, 800, "01-dictate.png");
await shot("06-popup.html", 1280, 800, "02-popup.png");
await shot("02-privacy.html", 1280, 800, "03-privacy.png");
await shot("03-fields.html", 1280, 800, "04-fields.png");
await shot("04-commands.html", 1280, 800, "05-commands.png");
await shot("05-promo.html", 440, 280, "promo-small.png");
await shot("05-promo.html", 1400, 560, "promo-marquee.png");

await browser.close();
