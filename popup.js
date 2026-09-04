(function () {
  "use strict";

  const Settings = window.VoiceAnywhereSettings;
  const engineLine = document.getElementById("engine-line");
  const enginePill = document.getElementById("engine-pill");
  const hotkeyLabel = document.getElementById("hotkey-label");
  const modeLabel = document.getElementById("mode-label");
  const siteToggle = document.getElementById("site-toggle");
  const siteHost = document.getElementById("site-host");
  const siteState = document.getElementById("site-state");
  const historyEl = document.getElementById("history");
  const undoBtn = document.getElementById("undo");

  let settings = Settings.normalize(Settings.DEFAULTS);
  let currentHost = "";
  let currentTabId = null;

  function pillClass(state) {
    enginePill.className = "va-pill" + (state ? " is-" + state : "");
  }

  function renderEngine(engine) {
    const state = engine && engine.state ? engine.state : "idle";
    const ready = !!(engine && engine.ready);
    if (ready || state === "ready") {
      const model = engine && engine.modelId ? String(engine.modelId).split("/").pop() : "whisper-base.en";
      engineLine.textContent = "On-device (" + model + "). Audio stays here.";
      enginePill.textContent = "Ready";
      pillClass("ready");
      return;
    }
    if (state === "error") {
      const msg = (engine && engine.message) || "Engine error";
      engineLine.textContent = /missing|npm run build/i.test(msg)
        ? msg
        : msg + " — try reloading the extension";
      enginePill.textContent = "Error";
      pillClass("error");
      return;
    }
    engineLine.textContent = (engine && engine.message) || "Loading speech engine…";
    enginePill.textContent = "Loading";
    pillClass("loading");
  }

  function renderSettings() {
    hotkeyLabel.textContent = Settings.hotkeyLabel(settings);
    modeLabel.textContent = Settings.effectiveMode(settings) === "toggle" ? "Toggle" : "Hold";
    renderSite();
  }

  function renderSite() {
    if (!currentHost) {
      siteHost.textContent = "This page";
      siteState.textContent = "—";
      siteToggle.disabled = true;
      return;
    }
    siteToggle.disabled = false;
    siteHost.textContent = currentHost;
    const on = Settings.siteAllowed(settings, currentHost);
    siteState.textContent = on ? "On" : "Off";
    siteToggle.classList.toggle("is-off", !on);
  }

  function renderHistory(items) {
    historyEl.innerHTML = "";
    if (!items || !items.length) {
      const empty = document.createElement("li");
      empty.className = "va-history-empty";
      empty.textContent = "Nothing dictated yet";
      historyEl.appendChild(empty);
      return;
    }
    items.slice(0, 6).forEach(function (item) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "va-history-item";
      btn.textContent = item.text;
      btn.title = "Copy";
      btn.addEventListener("click", function () {
        navigator.clipboard.writeText(item.text).then(function () {
          btn.classList.add("is-copied");
          setTimeout(function () {
            btn.classList.remove("is-copied");
          }, 700);
        });
      });
      li.appendChild(btn);
      historyEl.appendChild(li);
    });
  }

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  async function loadSite() {
    const tab = await activeTab();
    if (!tab || tab.id == null) return;
    currentTabId = tab.id;
    try {
      const info = await chrome.tabs.sendMessage(tab.id, { type: "get-site" });
      currentHost = info && info.host ? info.host : "";
    } catch (err) {
      currentHost = "";
    }
    renderSite();
  }

  async function refresh() {
    try {
      const state = await chrome.runtime.sendMessage({ type: "warmup" });
      if (state && state.settings) settings = Settings.normalize(state.settings);
      renderEngine(state && state.engine);
      renderSettings();
      renderHistory(state && state.history);
    } catch (err) {
      engineLine.textContent = "Reload the extension, then open this popup again";
      enginePill.textContent = "Error";
      pillClass("error");
      renderHistory([]);
    }
  }

  async function toggleSite() {
    if (!currentHost) return;
    const enabled = Settings.siteAllowed(settings, currentHost);
    let next = {
      siteMode: settings.siteMode,
      blockedHosts: settings.blockedHosts.slice(),
      allowedHosts: settings.allowedHosts.slice(),
    };
    if (enabled) {
      if (settings.siteMode === "allow") {
        next.allowedHosts = Settings.toggleHost(settings.allowedHosts, currentHost, false);
      } else {
        next.siteMode = "block";
        next.blockedHosts = Settings.toggleHost(settings.blockedHosts, currentHost, true);
      }
    } else if (settings.siteMode === "allow") {
      next.allowedHosts = Settings.toggleHost(settings.allowedHosts, currentHost, true);
    } else {
      next.blockedHosts = Settings.toggleHost(settings.blockedHosts, currentHost, false);
      if (!next.blockedHosts.length) next.siteMode = "all";
    }
    settings = await Settings.save(next);
    renderSite();
  }

  document.getElementById("open").addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    window.close();
  });

  document.getElementById("settings").addEventListener("click", function () {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  });

  siteToggle.addEventListener("click", function () {
    void toggleSite();
  });

  undoBtn.addEventListener("click", async function () {
    const tab = await activeTab();
    if (!tab || tab.id == null) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "client-undo" });
    } catch (err) {
      /* page may not have the content script */
    }
  });

  void refresh();
  void loadSite();
  setInterval(function () {
    void refresh();
  }, 1000);
})();
