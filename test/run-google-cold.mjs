import { launchExtensionChrome } from "./chrome.mjs";

const { context } = await launchExtensionChrome();
const page = await context.newPage();
await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
await page.click('textarea[name="q"]');
await page.waitForTimeout(300);

await page.keyboard.down("Control");
let overlay = "";
for (let i = 0; i < 180; i++) {
  overlay = await page.evaluate(() => {
    const label = document.querySelector("#voice-anywhere-host .va-label");
    return label ? label.textContent : "";
  });
  if (/listening|release control/i.test(overlay)) break;
  await page.waitForTimeout(500);
}
console.log("OVERLAY_AFTER_HOLD", overlay);
await page.waitForTimeout(5000);
await page.keyboard.up("Control");

for (let i = 0; i < 60; i++) {
  const after = await page.evaluate(() => {
    let value = "";
    for (const node of document.querySelectorAll('textarea[name="q"]')) {
      if (node.offsetWidth > 0) value = node.value;
    }
    const label = document.querySelector("#voice-anywhere-host .va-label");
    return { value, overlay: label ? label.textContent : "" };
  });
  if (after.value.trim() || /done|copied|error/i.test(after.overlay)) {
    console.log("RESULT", JSON.stringify(after));
    const ok = after.value.trim().length > 3;
    await context.close();
    process.exit(ok ? 0 : 1);
  }
  await page.waitForTimeout(1000);
}

console.log("TIMEOUT");
await context.close();
process.exit(1);
