import {
  assertOverlayLeavesListening,
  getExtensionId,
  holdControl,
  launchExtensionChrome,
  overlayState,
  waitForTranscript,
} from "./helpers.mjs";

const { context } = await launchExtensionChrome();
const extensionId = await getExtensionId(context);
console.log("extensionId", extensionId);

const page = await context.newPage();
page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
await page.goto("http://127.0.0.1:8765/test/dictation.html");

const box = page.locator("#box");
await box.click();
await page.waitForTimeout(400);

console.log("holding Control");
await holdControl(page, 5500);
console.log("released Control");

const afterRelease = await overlayState(page);
console.log("AFTER_RELEASE", JSON.stringify(afterRelease));
if (/release control when done/i.test(afterRelease.overlay || "")) {
  try {
    await assertOverlayLeavesListening(page, 4000);
  } catch (err) {
    console.log("FAIL stuck overlay", err.message);
    await context.close();
    process.exit(1);
  }
}

const done = await waitForTranscript(page);
console.log("DONE", JSON.stringify(done));
await context.close();
process.exit(0);
