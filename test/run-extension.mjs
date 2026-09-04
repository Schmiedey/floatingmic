import { getExtensionId, launchExtensionChrome } from "./chrome.mjs";

const { context } = await launchExtensionChrome();
const extensionId = await getExtensionId(context);
console.log("extensionId", extensionId);

const page = await context.newPage();
page.on("console", (msg) => console.log("CONSOLE", msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
await page.goto(`chrome-extension://${extensionId}/verify.html`);

const started = Date.now();
while (Date.now() - started < 180000) {
  const state = await page.evaluate(() => ({
    ok: window.__VA_OK,
    text: window.__VA_TEXT,
    error: window.__VA_ERROR,
    out: document.getElementById("out") && document.getElementById("out").textContent,
  }));
  if (state.ok === true || state.ok === false) {
    console.log("DONE", JSON.stringify(state));
    await context.close();
    process.exit(state.ok ? 0 : 1);
  }
  await page.waitForTimeout(1000);
}

console.log("TIMEOUT", await page.textContent("#out"));
await context.close();
process.exit(1);
