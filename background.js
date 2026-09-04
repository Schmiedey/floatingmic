importScripts("settings.js");

let clientTabId = null;
let clientFrameId = 0;
let clientPort = null;
let enginePort = null;
let creatingOffscreen = null;
const engineWaiters = [];
const MAX_HISTORY = 20;

let engineStatus = {
  state: "idle",
  message: "Not loaded",
  modelId: "Xenova/whisper-base.en",
  ready: false,
};

function hasStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;
}

function loadSettings() {
  if (!hasStorage() || !self.VoiceAnywhereSettings) {
    return Promise.resolve(
      self.VoiceAnywhereSettings
        ? self.VoiceAnywhereSettings.normalize(self.VoiceAnywhereSettings.DEFAULTS)
        : { modelId: "Xenova/whisper-base.en", language: "en" }
    );
  }
  return self.VoiceAnywhereSettings.load();
}

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (enginePort) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  if (await hasOffscreen()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (err) {
      /* already gone */
    }
  }
  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "On-device speech recognition for dictation on any site",
    })
    .catch(function () {
      return chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "On-device speech recognition for dictation on any site",
      });
    });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

function waitForEngine(ms) {
  if (enginePort) return Promise.resolve(enginePort);
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error("Speech engine did not start"));
    }, ms);
    engineWaiters.push(function (port) {
      clearTimeout(timer);
      resolve(port);
    });
  });
}

async function sendToEngine(type, extra) {
  await ensureOffscreen();
  const port = await waitForEngine(15000);
  port.postMessage(Object.assign({ type: type }, extra || {}));
}

async function configureEngine() {
  const settings = await loadSettings();
  engineStatus.modelId = settings.modelId;
  engineStatus.state = engineStatus.ready ? "ready" : "loading";
  if (!engineStatus.ready) engineStatus.message = "Loading speech engine…";
  await sendToEngine("engine-configure", {
    modelId: settings.modelId,
    language: settings.language,
  });
  updateBadge();
}

async function sendToClient(message) {
  if (clientPort) {
    try {
      clientPort.postMessage(message);
      return;
    } catch (err) {
      clientPort = null;
    }
  }
  if (clientTabId == null) return;
  try {
    await chrome.tabs.sendMessage(clientTabId, message, {
      frameId: clientFrameId,
    });
  } catch {
    /* tab gone */
  }
}

function openPermissionPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
}

function updateBadge() {
  if (!chrome.action) return;
  if (engineStatus.state === "error") {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#b33a2b" });
  } else if (engineStatus.state === "loading" || engineStatus.state === "idle") {
    chrome.action.setBadgeText({ text: "…" });
    chrome.action.setBadgeBackgroundColor({ color: "#c47a3a" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function setEngineStatus(patch) {
  engineStatus = Object.assign({}, engineStatus, patch);
  updateBadge();
}

function handleEngineEvent(message) {
  const event = message.event;
  if (event === "boot") {
    void configureEngine();
    return;
  }
  if (event === "ready") {
    setEngineStatus({
      state: "ready",
      ready: true,
      message: "Speech engine ready",
      modelId: message.modelId || engineStatus.modelId,
    });
    void sendToClient({ type: "speech-status", message: "Speech engine ready" });
    return;
  }
  if (event === "started") {
    void sendToClient({ type: "speech-started" });
  } else if (event === "chunk") {
    void sendToClient({
      type: "speech-chunk",
      text: message.text,
      isFinal: message.isFinal,
    });
  } else if (event === "status") {
    const text = message.message || "Working…";
    const loading = /loading|downloading|starting/i.test(text);
    setEngineStatus({
      state: engineStatus.ready && !loading ? "ready" : loading ? "loading" : engineStatus.state,
      message: text,
      ready: engineStatus.ready && !loading ? true : /ready/i.test(text) ? true : engineStatus.ready,
    });
    if (/ready/i.test(text)) {
      setEngineStatus({ state: "ready", ready: true, message: text });
    }
    void sendToClient({ type: "speech-status", message: text });
  } else if (event === "levels") {
    void sendToClient({
      type: "speech-levels",
      levels: message.levels,
      rms: message.rms,
    });
  } else if (event === "error") {
    setEngineStatus({
      state: "error",
      ready: false,
      message: message.detail || message.error || "Engine error",
    });
    if (
      message.error === "not-allowed" ||
      message.error === "service-not-allowed" ||
      message.error === "need-permission"
    ) {
      openPermissionPage();
    }
    void sendToClient({
      type: "speech-error",
      error: message.error,
      detail: message.detail,
    });
  } else if (event === "ended") {
    void sendToClient({ type: "speech-ended" });
  }
}

async function waitForEngineReady(timeoutMs) {
  if (engineStatus.ready) return;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (engineStatus.ready) return;
    if (engineStatus.state === "error") {
      throw new Error(engineStatus.message || "Speech engine failed to load");
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, 200);
    });
  }
  throw new Error("Speech engine is still loading. Wait for Ready in the popup, then try again.");
}

function warmupEngine() {
  void ensureOffscreen()
    .then(function () {
      return configureEngine();
    })
    .catch(function () {
      /* offscreen may already exist */
    });
}

async function handleClientStart(sender, port) {
  clientTabId = sender && sender.tab ? sender.tab.id : null;
  clientFrameId = sender && sender.frameId ? sender.frameId : 0;
  if (port) clientPort = port;
  try {
    await ensureOffscreen();
    if (!engineStatus.ready) {
      setEngineStatus({
        state: "loading",
        ready: false,
        message: "Loading speech engine…",
      });
      await sendToClient({
        type: "speech-status",
        message: "Loading speech engine… first launch can take up to a minute",
      });
      await configureEngine();
      await waitForEngineReady(120000);
    }
    await sendToEngine("engine-start");
  } catch (err) {
    await sendToClient({
      type: "speech-error",
      error: "start-failed",
      detail: err && err.message ? err.message : String(err),
    });
  }
}

async function addHistory(text, host) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  const current = await chrome.storage.local.get("history");
  const history = Array.isArray(current.history) ? current.history.slice() : [];
  history.unshift({
    text: trimmed,
    host: host || "",
    at: Date.now(),
  });
  await chrome.storage.local.set({ history: history.slice(0, MAX_HISTORY) });
}

async function getHistory() {
  const current = await chrome.storage.local.get("history");
  return Array.isArray(current.history) ? current.history : [];
}

async function openSearch(text) {
  const query = String(text || "").trim();
  if (!query) return;
  if (chrome.search && chrome.search.query) {
    try {
      await chrome.search.query({ text: query, disposition: "CURRENT_TAB" });
      return;
    } catch (err) {
      /* fall through to a Google URL */
    }
  }
  const url = "https://www.google.com/search?q=" + encodeURIComponent(query);
  if (clientTabId != null) {
    try {
      await chrome.tabs.update(clientTabId, { url: url });
      return;
    } catch (err) {
      /* tab gone */
    }
  }
  await chrome.tabs.create({ url: url });
}

async function getState() {
  const settings = await loadSettings();
  const history = await getHistory();
  return {
    engine: engineStatus,
    settings: settings,
    history: history,
  };
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === "engine") {
    enginePort = port;
    engineWaiters.splice(0).forEach(function (fn) {
      fn(port);
    });
    port.onMessage.addListener(function (message) {
      if (message && message.type === "engine-event") handleEngineEvent(message);
    });
    port.onDisconnect.addListener(function () {
      if (enginePort === port) enginePort = null;
      setEngineStatus({ state: "idle", ready: false, message: "Engine disconnected" });
    });
    return;
  }

  if (port.name === "client") {
    port.onMessage.addListener(function (message) {
      if (message.type === "client-start") {
        void handleClientStart(port.sender, port);
      } else if (message.type === "client-stop") {
        void sendToEngine("engine-stop").catch(function () {});
      } else if (message.type === "history-add") {
        void addHistory(message.text, message.host);
      } else if (message.type === "open-search") {
        void openSearch(message.text);
      }
    });
    port.onDisconnect.addListener(function () {
      if (clientPort === port) clientPort = null;
    });
  }
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return false;

  if (message.type === "client-start") {
    void handleClientStart(sender, null);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "client-stop") {
    void sendToEngine("engine-stop").catch(function () {});
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "engine-event") {
    handleEngineEvent(message);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "permission-granted") {
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "open-search") {
    void openSearch(message.text);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "history-add") {
    void addHistory(message.text, message.host).then(function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "get-state" || message.type === "warmup") {
    void ensureOffscreen()
      .then(function () {
        return configureEngine();
      })
      .then(function () {
        return getState();
      })
      .then(function (state) {
        sendResponse(state);
      })
      .catch(function () {
        void getState().then(sendResponse);
      });
    return true;
  }

  if (message.type === "clear-history") {
    void chrome.storage.local.set({ history: [] }).then(function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync") return;
    if (changes.modelId || changes.language) {
      engineStatus.ready = false;
      engineStatus.state = "loading";
      engineStatus.message = "Reloading speech engine…";
      updateBadge();
      void configureEngine();
    }
  });
}

updateBadge();
warmupEngine();
if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(function () {
    warmupEngine();
  });
}
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(function () {
    warmupEngine();
  });
}
