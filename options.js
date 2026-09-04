(function () {
  "use strict";

  const Settings = window.VoiceAnywhereSettings;
  const presetsEl = document.getElementById("hotkey-presets");
  const recordBtn = document.getElementById("record-hotkey");
  const hotkeyStatus = document.getElementById("hotkey-status");
  const modeHold = document.getElementById("mode-hold");
  const modeToggle = document.getElementById("mode-toggle");
  const modelEl = document.getElementById("model");
  const modelHint = document.getElementById("model-hint");
  const languageEl = document.getElementById("language");
  const voiceCommands = document.getElementById("voice-commands");
  const autoCap = document.getElementById("auto-cap");
  const punctuation = document.getElementById("punctuation");
  const blockedEl = document.getElementById("blocked");
  const allowedEl = document.getElementById("allowed");
  const siteButtons = Array.prototype.slice.call(document.querySelectorAll("[data-site]"));

  let settings = Settings.normalize(Settings.DEFAULTS);
  let recording = false;

  function hostsToText(list) {
    return (list || []).join("\n");
  }

  function textToHosts(value) {
    return String(value || "")
      .split(/\n+/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function renderHotkeys() {
    presetsEl.innerHTML = "";
    Settings.HOTKEY_PRESETS.forEach(function (preset) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "va-chip";
      btn.textContent = preset.label;
      const selected =
        settings.hotkeyKey === preset.key &&
        (!preset.code || settings.hotkeyCode === preset.code || (!settings.hotkeyCode && !preset.code));
      btn.classList.toggle("is-on", selected);
      btn.addEventListener("click", function () {
        void persist({ hotkeyKey: preset.key, hotkeyCode: preset.code || "" });
      });
      presetsEl.appendChild(btn);
    });
    hotkeyStatus.textContent = "Current key: " + Settings.hotkeyLabel(settings);
  }

  function render() {
    renderHotkeys();
    modeHold.classList.toggle("is-on", settings.captureMode !== "toggle" && settings.hotkeyKey !== "CapsLock");
    modeToggle.classList.toggle("is-on", settings.captureMode === "toggle" || settings.hotkeyKey === "CapsLock");
    if (settings.hotkeyKey === "CapsLock") {
      modeHold.disabled = true;
      modeToggle.classList.add("is-on");
      modeHold.classList.remove("is-on");
    } else {
      modeHold.disabled = false;
    }
    voiceCommands.checked = settings.voiceCommands;
    autoCap.checked = settings.autoCapitalize;
    punctuation.checked = settings.punctuation;
    modelEl.value = settings.modelId;
    languageEl.value = settings.language;
    const info = Settings.modelInfo(settings.modelId);
    modelHint.textContent = info.hint + (info.englishOnly ? " · English only" : "");
    languageEl.disabled = !!info.englishOnly;
    siteButtons.forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-site") === settings.siteMode);
    });
    if (document.activeElement !== blockedEl) blockedEl.value = hostsToText(settings.blockedHosts);
    if (document.activeElement !== allowedEl) allowedEl.value = hostsToText(settings.allowedHosts);
  }

  async function persist(partial) {
    settings = await Settings.save(partial);
    render();
    return settings;
  }

  async function chooseModel(modelId) {
    if (modelId !== Settings.BUNDLED_MODEL && chrome.permissions && chrome.permissions.request) {
      const granted = await chrome.permissions.request({
        origins: Settings.REMOTE_ORIGINS,
      });
      if (!granted) {
        modelEl.value = settings.modelId;
        modelHint.textContent =
          "Larger models download from Hugging Face. Stay on Base English to keep everything on this computer.";
        return;
      }
    }
    await persist({ modelId: modelId });
  }

  Settings.MODELS.forEach(function (model) {
    const opt = document.createElement("option");
    opt.value = model.id;
    opt.textContent = model.label;
    modelEl.appendChild(opt);
  });

  Settings.LANGUAGES.forEach(function (lang) {
    const opt = document.createElement("option");
    opt.value = lang.id;
    opt.textContent = lang.label;
    languageEl.appendChild(opt);
  });

  modeHold.addEventListener("click", function () {
    void persist({ captureMode: "hold" });
  });
  modeToggle.addEventListener("click", function () {
    void persist({ captureMode: "toggle" });
  });
  modelEl.addEventListener("change", function () {
    void chooseModel(modelEl.value);
  });
  languageEl.addEventListener("change", function () {
    void persist({ language: languageEl.value });
  });
  voiceCommands.addEventListener("change", function () {
    void persist({ voiceCommands: voiceCommands.checked });
  });
  autoCap.addEventListener("change", function () {
    void persist({ autoCapitalize: autoCap.checked });
  });
  punctuation.addEventListener("change", function () {
    void persist({ punctuation: punctuation.checked });
  });
  siteButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      void persist({ siteMode: btn.getAttribute("data-site") });
    });
  });
  blockedEl.addEventListener("change", function () {
    void persist({ blockedHosts: textToHosts(blockedEl.value) });
  });
  allowedEl.addEventListener("change", function () {
    void persist({ allowedHosts: textToHosts(allowedEl.value) });
  });

  recordBtn.addEventListener("click", function () {
    recording = true;
    recordBtn.textContent = "Listening for a key…";
    hotkeyStatus.textContent = "Press any key now. Escape cancels.";
  });

  window.addEventListener(
    "keydown",
    function (event) {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        recording = false;
        recordBtn.textContent = "Press a custom key";
        hotkeyStatus.textContent = "Current key: " + Settings.hotkeyLabel(settings);
        return;
      }
      recording = false;
      recordBtn.textContent = "Press a custom key";
      void persist({
        hotkeyKey: event.key,
        hotkeyCode: event.code || "",
      });
    },
    true
  );

  Settings.load().then(function (next) {
    settings = next;
    render();
  });
})();
