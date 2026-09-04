import {
  assertOverlayLeavesListening,
  getExtensionId,
  launchExtensionChrome,
  overlayState,
} from "./helpers.mjs";

const { context } = await launchExtensionChrome();
console.log("extensionId", await getExtensionId(context));

const page = await context.newPage();
page.on("console", (msg) => console.log("CONSOLE", msg.text()));
await page.goto("http://127.0.0.1:8765/test/dictation.html");
await page.locator("#box").click();

await page.keyboard.down("Control");
const startedHold = Date.now();
let live = [];
while (Date.now() - startedHold < 5000) {
  const holdingNow = await overlayState(page);
  if (!holdingNow.overlayVisible) {
    await page.waitForTimeout(100);
    continue;
  }
  live = await page.evaluate(() => {
    const bars = Array.from(document.querySelectorAll("#voice-anywhere-host .va-meter span"));
    return bars.map((bar) => bar.style.transform || "");
  });
  if (live.some((t) => /scaleY\((0\.[2-9]|[1-9])/.test(t))) break;
  await page.waitForTimeout(120);
}
const holding = await overlayState(page);
console.log("HOLDING", JSON.stringify(holding));
console.log("BARS", JSON.stringify(live));
if (!holding.overlayVisible || !holding.overlay) {
  console.log("FAIL overlay did not appear on keydown");
  await context.close();
  process.exit(1);
}
if (!live.some((t) => /scaleY\((0\.[2-9]|[1-9])/.test(t))) {
  console.log("FAIL meter did not react to audio");
  await context.close();
  process.exit(1);
}

await page.keyboard.up("Control");
const after = await assertOverlayLeavesListening(page, 5000);
console.log("AFTER_UP", JSON.stringify(after));
if (/release control when done/i.test(after.overlay || "")) {
  console.log("FAIL still listening after keyup");
  await context.close();
  process.exit(1);
}

await context.close();
console.log("PASS overlay left listening after keyup");
process.exit(0);
