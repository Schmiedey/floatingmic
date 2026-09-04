import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function launchExtensionChrome(extraArgs = []) {
  const ext = path.resolve(".");
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "va-ext-"));
  const wav = path.resolve("samples/jfk.wav");
  const sharedArgs = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required",
    ...extraArgs,
  ];

  const context = await chromium.launchPersistentContext(userData, {
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
      ...sharedArgs,
    ],
  });

  return { context, ext, userData };
}

export async function getExtensionId(context) {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    try {
      worker = await context.waitForEvent("serviceworker", { timeout: 20000 });
    } catch {
      worker = context.serviceWorkers()[0];
    }
  }
  if (worker) return worker.url().split("/")[2];

  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const { targetInfos } = await session.send("Target.getTargets");
  const sw = targetInfos.find(
    (t) =>
      (t.type === "service_worker" || t.type === "background_page") &&
      t.url.startsWith("chrome-extension://")
  );
  await page.close();
  if (!sw) throw new Error("Could not find extension id");
  return sw.url.split("/")[2];
}
