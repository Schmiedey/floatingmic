import { getExtensionId, launchExtensionChrome } from "./chrome.mjs";

function overlayState(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector("#voice-anywhere-host .va-label");
    return {
      value: document.getElementById("box") ? document.getElementById("box").value : "",
      overlay: overlay ? overlay.textContent : "",
      overlayVisible: !!(
        overlay &&
        overlay.closest(".va-overlay") &&
        overlay.closest(".va-overlay").classList.contains("va-visible")
      ),
    };
  });
}

export async function waitForOverlay(page, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await overlayState(page);
    if (state.overlayVisible && state.overlay) return state;
    await page.waitForTimeout(50);
  }
  throw new Error("Overlay did not appear: " + JSON.stringify(await overlayState(page)));
}

export async function holdControl(page, ms) {
  await page.keyboard.down("Control");
  await page.waitForTimeout(ms);
  await page.keyboard.up("Control");
}

export async function assertOverlayLeavesListening(page, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await overlayState(page);
    const text = (state.overlay || "").toLowerCase();
    if (!state.overlayVisible) return state;
    if (!text.includes("release control when done")) return state;
    await page.waitForTimeout(100);
  }
  const stuck = await overlayState(page);
  throw new Error("Overlay stuck on listening: " + JSON.stringify(stuck));
}

export async function waitForTranscript(page, timeoutMs = 120000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await overlayState(page);
    const value = (last.value || "").toLowerCase();
    if (
      value.includes("ask not") ||
      value.includes("fellow american") ||
      value.includes("your country") ||
      value.includes("ask what you")
    ) {
      return last;
    }
    const overlay = (last.overlay || "").toLowerCase();
    if (overlay.includes("could not") || overlay.includes("error") || overlay.includes("stalled")) {
      throw new Error("Dictation failed: " + JSON.stringify(last));
    }
    await page.waitForTimeout(250);
  }
  throw new Error("No transcript: " + JSON.stringify(last));
}

export { overlayState, getExtensionId, launchExtensionChrome };
