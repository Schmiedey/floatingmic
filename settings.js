(function (root) {
  "use strict";

  var DEFAULTS = {
    hotkeyCode: "F8",
    hotkeyKey: "F8",
    captureMode: "hold",
    voiceCommands: true,
    autoCapitalize: true,
    punctuation: true,
    modelId: "Xenova/whisper-base.en",
    language: "en",
    siteMode: "all",
    blockedHosts: [],
    allowedHosts: [],
  };

  var MODELS = [
    {
      id: "Xenova/whisper-base.en",
      label: "Base · English",
      hint: "Bundled · works offline · never leaves this computer",
      englishOnly: true,
    },
    {
      id: "Xenova/whisper-tiny.en",
      label: "Tiny · English",
      hint: "Optional Hugging Face download · ~75 MB · faster, less accurate",
      englishOnly: true,
    },
    {
      id: "Xenova/whisper-tiny",
      label: "Tiny · Multilingual",
      hint: "Optional Hugging Face download · ~75 MB",
      englishOnly: false,
    },
    {
      id: "Xenova/whisper-base",
      label: "Base · Multilingual",
      hint: "Optional Hugging Face download · ~150 MB",
      englishOnly: false,
    },
    {
      id: "Xenova/whisper-small.en",
      label: "Small · English",
      hint: "Optional Hugging Face download · ~500 MB · slower, more accurate",
      englishOnly: true,
    },
  ];

  var LANGUAGES = [
    { id: "auto", label: "Detect automatically" },
    { id: "en", label: "English" },
    { id: "es", label: "Spanish" },
    { id: "fr", label: "French" },
    { id: "de", label: "German" },
    { id: "pt", label: "Portuguese" },
    { id: "it", label: "Italian" },
    { id: "nl", label: "Dutch" },
    { id: "pl", label: "Polish" },
    { id: "sv", label: "Swedish" },
    { id: "tr", label: "Turkish" },
    { id: "ru", label: "Russian" },
    { id: "uk", label: "Ukrainian" },
    { id: "ar", label: "Arabic" },
    { id: "hi", label: "Hindi" },
    { id: "ja", label: "Japanese" },
    { id: "zh", label: "Chinese" },
    { id: "ko", label: "Korean" },
    { id: "vi", label: "Vietnamese" },
  ];

  var BUNDLED_MODEL = "Xenova/whisper-base.en";

  var REMOTE_ORIGINS = [
    "https://huggingface.co/*",
    "https://*.huggingface.co/*",
    "https://*.hf.co/*",
    "https://cdn-lfs.huggingface.co/*",
    "https://cas-bridge.xethub.hf.co/*",
  ];

  var HOTKEY_PRESETS = [
    { key: "Control", code: "", label: "Control" },
    { key: "Alt", code: "", label: "Alt / Option" },
    { key: "CapsLock", code: "CapsLock", label: "Caps Lock" },
    { key: "F8", code: "F8", label: "F8" },
    { key: "F9", code: "F9", label: "F9" },
    { key: "Pause", code: "Pause", label: "Pause" },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function asStringArray(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var host = String(value[i] || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");
      if (host && out.indexOf(host) === -1) out.push(host);
    }
    return out;
  }

  function normalize(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var settings = {
      hotkeyCode: typeof src.hotkeyCode === "string" ? src.hotkeyCode : DEFAULTS.hotkeyCode,
      hotkeyKey: src.hotkeyKey ? String(src.hotkeyKey) : DEFAULTS.hotkeyKey,
      captureMode: src.captureMode === "toggle" ? "toggle" : "hold",
      voiceCommands: src.voiceCommands !== false,
      autoCapitalize: src.autoCapitalize !== false,
      punctuation: src.punctuation !== false,
      modelId: src.modelId ? String(src.modelId) : DEFAULTS.modelId,
      language: src.language ? String(src.language) : DEFAULTS.language,
      siteMode: src.siteMode === "block" || src.siteMode === "allow" ? src.siteMode : "all",
      blockedHosts: asStringArray(src.blockedHosts),
      allowedHosts: asStringArray(src.allowedHosts),
    };
    var known = false;
    for (var i = 0; i < MODELS.length; i++) {
      if (MODELS[i].id === settings.modelId) known = true;
    }
    if (!known) settings.modelId = DEFAULTS.modelId;
    if (settings.modelId === "Xenova/whisper-tiny.en") {
      settings.modelId = DEFAULTS.modelId;
    }
    return settings;
  }

  function modelInfo(modelId) {
    for (var i = 0; i < MODELS.length; i++) {
      if (MODELS[i].id === modelId) return MODELS[i];
    }
    return MODELS[0];
  }

  function hotkeyLabel(settings) {
    var key = settings && settings.hotkeyKey ? settings.hotkeyKey : "F8";
    var code = settings && settings.hotkeyCode ? settings.hotkeyCode : "";
    if (code === "ControlRight") return "Right Control";
    if (code === "ControlLeft") return "Left Control";
    if (code === "AltRight") return "Right Alt";
    if (code === "AltLeft") return "Left Alt";
    for (var i = 0; i < HOTKEY_PRESETS.length; i++) {
      if (HOTKEY_PRESETS[i].key === key && (!HOTKEY_PRESETS[i].code || HOTKEY_PRESETS[i].code === code)) {
        return HOTKEY_PRESETS[i].label;
      }
    }
    if (key === " ") return "Space";
    if (key === "CapsLock") return "Caps Lock";
    return key;
  }

  function effectiveMode(settings) {
    if (settings && settings.hotkeyKey === "CapsLock") return "toggle";
    return settings && settings.captureMode === "toggle" ? "toggle" : "hold";
  }

  function matchesHotkey(event, settings) {
    if (!event) return false;
    var key = settings && settings.hotkeyKey ? settings.hotkeyKey : "F8";
    var code = settings && settings.hotkeyCode ? settings.hotkeyCode : "";
    var eventKey = event.key || "";
    var eventCode = event.code || "";
    var matched = false;
    if (code) {
      matched = eventCode === code || (key && eventKey === key && eventCode.indexOf(key) === 0);
    } else if (key === "Control") {
      matched =
        eventKey === "Control" ||
        eventCode === "ControlLeft" ||
        eventCode === "ControlRight";
    } else if (key === "Alt") {
      matched = eventKey === "Alt" || eventCode === "AltLeft" || eventCode === "AltRight";
    } else {
      matched = eventKey === key || eventCode === key;
    }
    if (!matched) return false;
    if (key !== "Control" && event.ctrlKey) return false;
    if (key !== "Alt" && event.altKey) return false;
    if (key !== "Meta" && event.metaKey) return false;
    if (key !== "Shift" && event.shiftKey) return false;
    return true;
  }

  function shouldCaptureHotkey(settings) {
    var key = settings && settings.hotkeyKey ? settings.hotkeyKey : "";
    return key === "CapsLock" || key === " " || /^F\d{1,2}$/.test(key) || key === "Pause";
  }

  function siteAllowed(settings, hostname) {
    var host = String(hostname || "").toLowerCase();
    if (!host) return true;
    var mode = settings && settings.siteMode ? settings.siteMode : "all";
    if (mode === "block") {
      return (settings.blockedHosts || []).indexOf(host) === -1;
    }
    if (mode === "allow") {
      return (settings.allowedHosts || []).indexOf(host) !== -1;
    }
    return true;
  }

  function siteEnabledFor(settings, hostname) {
    return siteAllowed(settings, hostname);
  }

  function toggleHost(list, hostname, enabled) {
    var host = String(hostname || "").toLowerCase();
    var next = asStringArray(list);
    var index = next.indexOf(host);
    if (enabled && index === -1) next.push(host);
    if (!enabled && index !== -1) next.splice(index, 1);
    return next;
  }

  function hasStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;
  }

  function load() {
    if (!hasStorage()) {
      return Promise.resolve(normalize(DEFAULTS));
    }
    return chrome.storage.sync.get(null).then(function (raw) {
      var settings = normalize(raw);
      if (
        !raw.hotkeyMigrated423 &&
        settings.hotkeyKey === "Control" &&
        (!raw.hotkeyCode || raw.hotkeyCode === "")
      ) {
        settings.hotkeyCode = "F8";
        settings.hotkeyKey = "F8";
        return chrome.storage.sync
          .set({ hotkeyCode: "F8", hotkeyKey: "F8", hotkeyMigrated423: true })
          .then(function () {
            return settings;
          });
      }
      return settings;
    });
  }

  function save(partial) {
    if (!hasStorage()) return Promise.resolve(normalize(partial));
    var next = {};
    var keys = Object.keys(DEFAULTS);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(partial, key)) next[key] = partial[key];
    }
    return chrome.storage.sync.set(next).then(function () {
      return load();
    });
  }

  root.VoiceAnywhereSettings = {
    DEFAULTS: clone(DEFAULTS),
    MODELS: MODELS,
    LANGUAGES: LANGUAGES,
    HOTKEY_PRESETS: HOTKEY_PRESETS,
    BUNDLED_MODEL: BUNDLED_MODEL,
    REMOTE_ORIGINS: REMOTE_ORIGINS,
    normalize: normalize,
    modelInfo: modelInfo,
    hotkeyLabel: hotkeyLabel,
    effectiveMode: effectiveMode,
    matchesHotkey: matchesHotkey,
    shouldCaptureHotkey: shouldCaptureHotkey,
    siteAllowed: siteAllowed,
    siteEnabledFor: siteEnabledFor,
    toggleHost: toggleHost,
    load: load,
    save: save,
  };
  if (typeof window !== "undefined" && window !== root) {
    window.VoiceAnywhereSettings = root.VoiceAnywhereSettings;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
