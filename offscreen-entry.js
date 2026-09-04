const pending = [];
let dispatch = null;
const port = chrome.runtime.connect({ name: "engine" });

function emit(event, payload) {
  const message = Object.assign({ type: "engine-event", event: event }, payload || {});
  try {
    port.postMessage(message);
  } catch (err) {
    chrome.runtime.sendMessage(message).catch(function () {});
  }
}

function handle(message) {
  if (
    !message ||
    (message.type !== "engine-start" &&
      message.type !== "engine-stop" &&
      message.type !== "engine-configure")
  ) {
    return;
  }
  if (dispatch) dispatch(message);
  else pending.push(message);
}

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (
    message &&
    (message.type === "engine-start" ||
      message.type === "engine-stop" ||
      message.type === "engine-ping" ||
      message.type === "engine-configure")
  ) {
    handle(message);
    sendResponse({ ok: true, ready: !!dispatch });
  }
  return false;
});

port.onMessage.addListener(handle);
emit("boot");

import("./offscreen.js")
  .then(function (mod) {
    if (mod.setEmitter) mod.setEmitter(emit);
    dispatch = mod.dispatch;
    const queued = pending.splice(0);
    queued.forEach(dispatch);
    const configured = queued.some(function (item) {
      return item && item.type === "engine-configure";
    });
    if (!configured && mod.preload) void mod.preload();
  })
  .catch(function (err) {
    emit("error", {
      error: "model-failed",
      detail: err && err.message ? err.message : String(err),
    });
  });
