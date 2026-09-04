import { chromium } from "playwright-core";

const page = await (await chromium.launch({ channel: "chrome", headless: true })).newPage();
await page.goto("http://127.0.0.1:8765/test/insert.html");
await page.waitForFunction(() => window.__VA_INSERT_OK === true || window.__VA_INSERT_OK === false);
const result = await page.evaluate(() => ({ ok: window.__VA_INSERT_OK, value: window.__VA_INSERT }));
console.log(JSON.stringify(result));
await page.context().browser().close();
process.exit(result.ok ? 0 : 1);
