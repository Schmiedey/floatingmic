import { chromium } from "playwright-core";
import { getExtensionId, launchExtensionChrome } from "./chrome.mjs";

const { context } = await launchExtensionChrome();
const extensionId = await getExtensionId(context);
const page = await context.newPage();
page.on("console", (msg) => console.log("CONSOLE", msg.text()));

await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);

const probe = await page.evaluate(() => {
  const areas = Array.prototype.slice.call(document.querySelectorAll('textarea[name="q"], input[name="q"]'));
  return areas.map((el) => ({
    tag: el.tagName,
    id: el.id,
    readOnly: el.readOnly,
    visible: !!(el.offsetWidth && el.offsetHeight),
    rect: el.getBoundingClientRect(),
    value: el.value,
  }));
});
console.log("GOOGLE_FIELDS", JSON.stringify(probe, null, 2));

await page.click('textarea[name="q"], input[name="q"]', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(300);

const insertProbe = await page.evaluate(() => {
  return new Promise((resolve) => {
    const areas = document.querySelectorAll('textarea[name="q"]');
    let el = null;
    for (const node of areas) {
      if (node.offsetWidth > 0 && node.offsetHeight > 0) {
        el = node;
        break;
      }
    }
    if (!el) {
      resolve({ ok: false, reason: "no visible textarea" });
      return;
    }
    el.focus();
    const wasReadonly = el.readOnly;
    if (el.readOnly) el.readOnly = false;
    const start = el.selectionStart || 0;
    const text = "voice test ";
    const proto = HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc.set.call(el, el.value.slice(0, start) + text + el.value.slice(el.selectionEnd || start));
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text })
    );
    if (wasReadonly) el.readOnly = true;
    resolve({ ok: el.value.includes("voice test"), value: el.value, wasReadonly });
  });
});
console.log("DIRECT_INSERT", JSON.stringify(insertProbe));

await page.keyboard.down("Control");
await page.waitForTimeout(200);
const overlay = await page.evaluate(() => {
  const label = document.querySelector("#voice-anywhere-host .va-label");
  return label ? label.textContent : "";
});
console.log("OVERLAY_WHILE_HOLDING", overlay);

await page.keyboard.up("Control");
await page.waitForTimeout(8000);

const after = await page.evaluate(() => {
  const areas = document.querySelectorAll('textarea[name="q"]');
  let value = "";
  for (const node of areas) {
    if (node.offsetWidth > 0) value = node.value;
  }
  const label = document.querySelector("#voice-anywhere-host .va-label");
  return {
    value,
    overlay: label ? label.textContent : "",
    hasInsert: typeof window.__voiceAnywhereInsert !== "undefined",
    hasSettings: typeof window.VoiceAnywhereSettings !== "undefined",
  };
});
console.log("AFTER_DICTATION", JSON.stringify(after, null, 2));

await context.close();
process.exit(insertProbe.ok ? 0 : 1);
