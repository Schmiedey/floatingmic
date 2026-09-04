import {
  assertOverlayLeavesListening,
  getExtensionId,
  holdControl,
  launchExtensionChrome,
  waitForTranscript,
} from "./helpers.mjs";

const { context } = await launchExtensionChrome();
console.log("extensionId", await getExtensionId(context));

const page = await context.newPage();
page.on("console", (msg) => console.log("CONSOLE", msg.text()));
await page.goto("http://127.0.0.1:8765/test/iframe.html");

const frame = page.frameLocator("iframe");
await frame.locator("#box").click();
await page.waitForTimeout(400);
await holdControl(page, 5500);
await assertOverlayLeavesListening(page.frames()[1], 5000);
const done = await waitForTranscript(page.frames()[1]);
console.log("DONE", JSON.stringify(done));
await context.close();
process.exit(0);
