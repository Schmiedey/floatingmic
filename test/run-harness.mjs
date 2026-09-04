import { chromium } from "playwright-core";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});
const page = await browser.newPage();
page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
page.on("requestfailed", (req) =>
  console.log("REQFAIL", req.url(), req.failure() && req.failure().errorText)
);

await page.goto("http://127.0.0.1:8765/test/harness.html", {
  waitUntil: "domcontentloaded",
});

const started = Date.now();
while (Date.now() - started < 180000) {
  const state = await page.evaluate(() => ({
    ok: window.__VA_OK,
    text: window.__VA_TEXT,
    error: window.__VA_ERROR,
    out: document.getElementById("out") && document.getElementById("out").textContent,
  }));
  if (state.ok === true || state.ok === false) {
    console.log("DONE", JSON.stringify(state, null, 2));
    await browser.close();
    process.exit(state.ok ? 0 : 1);
  }
  await page.waitForTimeout(1000);
}

const out = await page.textContent("#out");
console.log("TIMEOUT\n", out);
await browser.close();
process.exit(1);
