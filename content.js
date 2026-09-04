(function () {
  "use strict";

  const SOURCE = "voice-anywhere";
  const Settings = window.VoiceAnywhereSettings || globalThis.VoiceAnywhereSettings;
  const TextTools = window.VoiceAnywhereText || globalThis.VoiceAnywhereText;
  const DONE_MS = 1100;
  const WATCHDOG_MS = 20000;

  let overlayEl = null;
  let hideTimer = null;
  let watchdogTimer = null;
  let holding = false;
  let heardSpeech = false;
  let clipboardFromPage = "";
  let hadTarget = true;
  let lastFinalText = "";
  let port = null;
  let settings = Settings ? Settings.normalize(Settings.DEFAULTS) : { hotkeyKey: "F8", captureMode: "hold" };

  function isHotkey(event) {
    if (Settings) return Settings.matchesHotkey(event, settings);
    return (
      event.code === "ControlLeft" ||
      event.code === "ControlRight" ||
      event.key === "Control"
    );
  }

  function mode() {
    return Settings ? Settings.effectiveMode(settings) : "hold";
  }

  function hotkeyName() {
    return Settings ? Settings.hotkeyLabel(settings) : "F8";
  }

  function pageHost() {
    return location.hostname || "";
  }

  function siteEnabled() {
    return Settings ? Settings.siteAllowed(settings, pageHost()) : true;
  }

  function frameOwnsKeys() {
    if (window.top === window) {
      const active = document.activeElement;
      if (active && (active.tagName === "IFRAME" || active.tagName === "FRAME")) return false;
      return true;
    }
    try {
      return document.hasFocus();
    } catch (err) {
      return false;
    }
  }

  function listeningCopy() {
    if (mode() === "toggle") return "Press " + hotkeyName() + " again to stop";
    return "Release " + hotkeyName() + " when done";
  }

  function connect() {
    if (port) return port;
    try {
      port = chrome.runtime.connect({ name: "client" });
      port.onMessage.addListener(onEngineMessage);
      port.onDisconnect.addListener(function () {
        port = null;
      });
      return port;
    } catch (err) {
      port = null;
      return null;
    }
  }

  function send(message) {
    const active = connect();
    if (active) {
      try {
        active.postMessage(message);
        return;
      } catch (err) {
        port = null;
      }
    }
    try {
      const pending = chrome.runtime.sendMessage(message);
      if (pending && typeof pending.catch === "function") {
        pending.catch(function () {
          flash("error", "Reload this page after updating the extension", 6000);
        });
      }
    } catch (err) {
      flash("error", "Reload this page after updating the extension", 6000);
    }
  }

  function pushSettings() {
    window.postMessage(
      { source: SOURCE, role: "settings", settings: settings },
      "*"
    );
  }

  function createOverlay() {
    if (overlayEl) return overlayEl;
    const host = document.createElement("div");
    host.id = "voice-anywhere-host";
    const inner = document.createElement("div");
    inner.className = "va-overlay";
    inner.setAttribute("role", "status");

    const meter = document.createElement("div");
    meter.className = "va-meter";
    meter.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 7; i++) {
      meter.appendChild(document.createElement("span"));
    }

    const copy = document.createElement("div");
    copy.className = "va-copy";
    const kicker = document.createElement("span");
    kicker.className = "va-kicker";
    const label = document.createElement("span");
    label.className = "va-label";
    copy.appendChild(kicker);
    copy.appendChild(label);

    inner.appendChild(meter);
    inner.appendChild(copy);
    host.appendChild(inner);
    (document.body || document.documentElement).appendChild(host);
    overlayEl = inner;
    return overlayEl;
  }

  function kickerFor(state) {
    if (state === "listening") return "Listening";
    if (state === "processing") return "Working";
    if (state === "inserted") return "Inserted";
    if (state === "clipboard") return "Copied";
    if (state === "error") return "Error";
    if (state === "warn") return "Ready";
    return "";
  }

  function clearLevels() {
    if (!overlayEl) return;
    overlayEl.classList.remove("va-speaking");
    overlayEl.style.removeProperty("--va-rms");
    const bars = overlayEl.querySelectorAll(".va-meter span");
    for (let i = 0; i < bars.length; i++) {
      bars[i].style.transform = "";
      bars[i].style.opacity = "";
    }
  }

  function applyLevels(levels, rms) {
    if (!overlayEl || !overlayEl.classList.contains("va-state-listening")) return;
    const bars = overlayEl.querySelectorAll(".va-meter span");
    const energy = typeof rms === "number" ? rms : 0;
    overlayEl.style.setProperty("--va-rms", String(energy));
    overlayEl.classList.toggle("va-speaking", energy > 0.12);
    for (let i = 0; i < bars.length; i++) {
      const value = Math.max(0.08, Math.min(1, (levels && levels[i]) || 0.08));
      bars[i].style.transform = "scaleY(" + value.toFixed(3) + ")";
      bars[i].style.opacity = String(0.35 + value * 0.65);
    }
  }

  function setOverlay(state, message) {
    const overlay = createOverlay();
    clearTimeout(hideTimer);
    if (state !== "listening") clearLevels();
    overlay.className = "va-overlay va-visible va-state-" + state;
    overlay.querySelector(".va-kicker").textContent = kickerFor(state);
    const label = overlay.querySelector(".va-label");
    if (label.textContent !== message) {
      label.textContent = message;
      label.classList.remove("va-swap");
      void label.offsetWidth;
      label.classList.add("va-swap");
    }
  }

  function hideOverlay() {
    if (!overlayEl) return;
    overlayEl.classList.remove("va-visible");
    clearLevels();
    clearTimeout(hideTimer);
  }

  function flash(state, message, ms) {
    setOverlay(state, message);
    hideTimer = setTimeout(hideOverlay, ms || DONE_MS);
  }

  function clearWatchdog() {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function armWatchdog() {
    clearWatchdog();
    watchdogTimer = setTimeout(function () {
      holding = false;
      flash("error", "Speech engine stalled. Reload the extension and this page.", 6000);
    }, WATCHDOG_MS);
  }

  function errorMessage(error, detail) {
    if (error === "not-allowed" || error === "service-not-allowed" || error === "need-permission") {
      return "Click the extension icon and allow the microphone";
    }
    if (error === "audio-capture") return "No microphone found";
    if (error === "transcribe-failed" || error === "model-failed") {
      return detail || "Could not transcribe. Reload the extension and try again.";
    }
    if (error === "start-failed") return detail || "Could not start listening";
    return detail || "Speech error: " + error;
  }

  function postInsert(text, isFinal) {
    window.postMessage(
      { source: SOURCE, role: "client", type: "chunk", text: text, isFinal: isFinal },
      "*"
    );
  }

  function postUndo() {
    window.postMessage({ source: SOURCE, role: "client", type: "undo" }, "*");
  }

  async function finish(clipboard) {
    clearWatchdog();
    const text = (clipboard || clipboardFromPage || "").trim();
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        flash(
          "clipboard",
          hadTarget ? "Copied to clipboard" : "Click a text field first — copied instead",
          2800
        );
      } catch (err) {
        flash(
          hadTarget ? "error" : "warn",
          hadTarget ? "Could not copy to clipboard" : "Click a text field first",
          2500
        );
      }
      return;
    }
    if (heardSpeech) {
      flash("inserted", "Done");
    } else {
      hideOverlay();
    }
  }

  function startSession() {
    holding = true;
    heardSpeech = false;
    clipboardFromPage = "";
    lastFinalText = "";
    hadTarget = true;
    setOverlay("listening", listeningCopy());
    armWatchdog();
    send({ type: "client-start" });
  }

  function stopSession() {
    if (!holding) return;
    holding = false;
    setOverlay("processing", "Transcribing…");
    armWatchdog();
    send({ type: "client-stop" });
    window.postMessage({ source: SOURCE, role: "client", type: "end-session" }, "*");
  }

  function onEngineMessage(message) {
    if (!message || !message.type) return;
    if (message.type === "engine-start" || message.type === "engine-stop") return;
    if (message.type === "client-undo") {
      postUndo();
      flash("inserted", "Undid last dictation", 1600);
      return;
    }

    if (message.type === "speech-levels") {
      applyLevels(message.levels, message.rms);
      return;
    }

    if (message.type === "speech-started") {
      if (holding) setOverlay("listening", listeningCopy());
      return;
    }

    if (message.type === "speech-status") {
      const text = message.message || "Working…";
      if (!holding && /loading|downloading|starting|ready/i.test(text)) {
        return;
      }
      if (holding && /loading speech engine|first launch/i.test(text)) {
        setOverlay("listening", text);
        return;
      }
      setOverlay(holding ? "listening" : "processing", text);
      return;
    }

    if (message.type === "speech-chunk") {
      const raw = String(message.text || "").trim();
      if (TextTools && TextTools.isLikelyHallucination(raw)) {
        if (message.isFinal) {
          setOverlay("warn", "No speech detected", 1800);
        }
        return;
      }
      heardSpeech = true;
      lastFinalText = message.text || lastFinalText;
      postInsert(message.text, message.isFinal);
      if (message.isFinal && (message.text || "").trim()) {
        send({
          type: "history-add",
          text: String(message.text).trim(),
          host: pageHost(),
        });
      }
      const label = (message.text || "").trim().slice(-48);
      setOverlay("listening", label || "Listening…");
      return;
    }

    if (message.type === "speech-error") {
      holding = false;
      clearWatchdog();
      flash("error", errorMessage(message.error, message.detail), 6000);
      return;
    }

    if (message.type === "speech-ended") {
      if (holding) return;
      void finish(clipboardFromPage);
    }
  }

  function loadSettings() {
    if (!Settings) return Promise.resolve();
    return Settings.load().then(function (next) {
      settings = next;
      pushSettings();
    });
  }

  window.addEventListener(
    "keydown",
    function (event) {
      if (event.key === "Escape" && holding) {
        stopSession();
        return;
      }
      if (!isHotkey(event) || event.repeat) return;
      if (!frameOwnsKeys()) return;
      if (!siteEnabled()) {
        flash("warn", "Off on this site", 1800);
        return;
      }
      if (Settings && Settings.shouldCaptureHotkey(settings)) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (holding && mode() === "toggle") {
        stopSession();
        return;
      }
      if (holding) return;
      startSession();
    },
    true
  );

  window.addEventListener(
    "keyup",
    function (event) {
      if (!holding || mode() === "toggle") return;
      if (!isHotkey(event)) return;
      stopSession();
    },
    true
  );

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && holding && mode() !== "toggle") stopSession();
  });

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    if (data.role === "insert" && data.type === "session-ended") {
      clipboardFromPage = data.clipboard || "";
    }
    if (data.role === "insert" && data.type === "need-search") {
      send({ type: "open-search", text: data.text || lastFinalText });
      flash("inserted", "Searching Google…", 1600);
      return;
    }
    if (data.role === "insert" && data.type === "target") {
      hadTarget = !!data.found;
      if (holding && !hadTarget) {
        setOverlay("listening", "Speak a Google search, or click a text field");
      }
    }
  });

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message && message.type === "get-site") {
      if (window.top !== window) return false;
      sendResponse({ host: pageHost(), href: location.href });
      return false;
    }
    if (message && message.type === "client-undo") {
      postUndo();
      flash("inserted", "Undid last dictation", 1600);
      sendResponse({ ok: true });
      return false;
    }
    onEngineMessage(message);
    return false;
  });

  try {
    connect();
    void loadSettings();
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "sync") return;
        void loadSettings();
      });
    }
  } catch (err) {
    /* hotkeys still work even if the engine port is not ready */
  }
})();
