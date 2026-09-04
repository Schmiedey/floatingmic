import { chromium } from "playwright-core";

const page = await (await chromium.launch({ channel: "chrome", headless: true })).newPage();
await page.goto("http://127.0.0.1:8765/test/fields.html");
await page.waitForFunction(
  () => Array.isArray(window.__VA_FIELD_RESULTS) && window.__VA_FIELD_RESULTS.length === 5,
  null,
  { timeout: 10000 }
);
const results = await page.evaluate(() => window.__VA_FIELD_RESULTS);
console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
await page.context().browser().close();
process.exit(failed.length ? 1 : 0);
