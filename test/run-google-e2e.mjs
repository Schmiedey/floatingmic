import { chromium } from "playwright-core";
import path from "node:path";
import { getExtensionId, launchExtensionChrome } from "./chrome.mjs";

const { context } = await launchExtensionChrome();
const extensionId = await getExtensionId(context);

// Warm engine on verify page
const verify = await context.newPage();
await verify.goto(`chrome-extension://${extensionId}/verify.html`, { timeout: 120000 });
for (let i = 0; i < 180; i++) {
  const state = await verify.evaluate(() => ({
    ok: window.__VA_OK,
    error: window.__VA_ERROR,
    out: document.getElementById("out")?.textContent,
  }));
  if (state.ok === true || state.ok === false) {
    console.log("VERIFY", JSON.stringify(state));
    if (!state.ok) {
      await context.close();
      process.exit(1);
    }
    break;
  }
  await verify.waitForTimeout(1000);
}

const page = await context.newPage();
await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1000);
await page.click('textarea[name="q"]');
await page.waitForTimeout(300);

await page.keyboard.down("Control");
await page.waitForTimeout(6000);
await page.keyboard.up("Control");
await page.waitForTimeout(15000);

const after = await page.evaluate(() => {
  let value = "";
  for (const node of document.querySelectorAll('textarea[name="q"]')) {
    if (node.offsetWidth > 0) value = node.value;
  }
  const label = document.querySelector("#voice-anywhere-host .va-label");
  return { value, overlay: label ? label.textContent : "" };
});
console.log("RESULT", JSON.stringify(after));
const ok = /ask not|fellow american|your country|ask what you/i.test(after.value);
await context.close();
process.exit(ok ? 0 : 1);
