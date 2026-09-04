(function () {
  "use strict";

  if (window.__voiceAnywhereInsert) return;
  window.__voiceAnywhereInsert = true;

  const SOURCE = "voice-anywhere";
  const Settings = window.VoiceAnywhereSettings;
  const TextTools = window.VoiceAnywhereText;

  const BLOCKED_INPUT_TYPES = new Set([
    "button",
    "checkbox",
    "radio",
    "file",
    "hidden",
    "submit",
    "reset",
    "image",
    "range",
    "color",
  ]);

  const EDITABLE_SELECTOR =
    'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], ' +
    'input[type="tel"], input[type="email"], input[type="password"], input[type="number"], ' +
    'input[type="date"], input[type="datetime-local"], input[type="month"], input[type="week"], ' +
    'input[type="time"], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], ' +
    '[role="textbox"], [role="searchbox"]';

  const SEARCH_SELECTORS = [
    'textarea[name="q"]',
    'input[name="q"]',
    'input[type="search"]',
    '[role="searchbox"]',
    'form[role="search"] textarea',
    'form[role="search"] input[type="text"]',
    '[aria-label*="Search" i] textarea',
    '[aria-label*="Search" i] input:not([type="hidden"])',
    '[aria-label*="search" i] textarea',
    '[aria-label*="search" i] input:not([type="hidden"])',
  ];

  let settings = Settings ? Settings.normalize(Settings.DEFAULTS) : { hotkeyKey: "Control", captureMode: "hold" };
  let targetEl = null;
  let lastFocusedEditable = null;
  let clipboardBuffer = "";
  let pendingStable = "";
  let holding = false;
  let lastInserted = "";
  let lastTarget = null;

  function post(type, payload) {
    window.postMessage(
      Object.assign({ source: SOURCE, role: "insert", type: type }, payload || {}),
      "*"
    );
  }

  function isHotkey(event) {
    if (Settings) return Settings.matchesHotkey(event, settings);
    return (
      event.code === "ControlLeft" ||
      event.code === "ControlRight" ||
      event.key === "Control"
    );
  }

  function mode() {
    return Settings ? Settings.effectiveMode(settings) : settings.captureMode || "hold";
  }

  function siteEnabled() {
    if (!Settings) return true;
    let host = location.hostname;
    try {
      if (window.top && window.top !== window) host = window.top.location.hostname;
    } catch (err) {
      host = location.hostname;
    }
    return Settings.siteAllowed(settings, host);
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest && el.closest("[hidden], [aria-hidden='true']")) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isTextInput(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    const type = (el.type || "text").toLowerCase();
    return !BLOCKED_INPUT_TYPES.has(type);
  }

  function isSearchLikeInput(el) {
    if (!el || !isTextInput(el)) return false;
    const name = (el.getAttribute("name") || "").toLowerCase();
    const type = (el.type || "text").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
    return (
      name === "q" ||
      name === "query" ||
      name === "search" ||
      type === "search" ||
      aria.indexOf("search") !== -1 ||
      placeholder.indexOf("search") !== -1
    );
  }

  function canUseReadonlySearch(el) {
    if (!el || !isSearchLikeInput(el)) return false;
    const active = deepActive();
    if (el === active || el === lastFocusedEditable || el === targetEl) return true;
    if (!isVisible(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 18;
  }

  function isDiscoverable(el) {
    if (!el || el.nodeType !== 1 || el.disabled) return false;
    if (isEditable(el)) return true;
    if (!isTextInput(el) || !isSearchLikeInput(el) || !isVisible(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 18;
  }

  function scoreSearchField(el) {
    let score = 0;
    if (!el || !isDiscoverable(el)) return score;
    const rect = el.getBoundingClientRect();
    if (isSearchLikeInput(el)) score += 40;
    if (el.name === "q") score += 80;
    if (el.id === "APjFqb") score += 100;
    if (el.classList && el.classList.contains("gLFyf")) score += 70;
    if (deepActive() === el) score += 60;
    if (el === lastFocusedEditable) score += 50;
    if (el === targetEl) score += 45;
    if (rect.top < window.innerHeight * 0.45) score += 20;
    score += Math.min(rect.width, 900) / 40;
    score += Math.min(rect.height, 120) / 10;
    return score;
  }

  function pickBestSearchField(nodes) {
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < nodes.length; i++) {
      const hit = editableFromNode(nodes[i], nodes[i]) || (isDiscoverable(nodes[i]) ? nodes[i] : null);
      if (!hit || !isVisible(hit)) continue;
      const score = scoreSearchField(hit);
      if (score > bestScore) {
        bestScore = score;
        best = hit;
      }
    }
    return best;
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled) return false;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return false;
    if (el.isContentEditable) {
      const ce = (el.getAttribute("contenteditable") || "").toLowerCase();
      if (ce === "false") return false;
      return true;
    }
    if (isTextInput(el)) {
      if (el.readOnly && !canUseReadonlySearch(el)) return false;
      return true;
    }
    const role = el.getAttribute && el.getAttribute("role");
    if (role === "textbox" || role === "searchbox") {
      return el.isContentEditable;
    }
    return false;
  }

  function rememberFocus(el) {
    if (el && el.isConnected && (isEditable(el) || isDiscoverable(el))) lastFocusedEditable = el;
  }

  document.addEventListener(
    "pointerdown",
    function (event) {
      const hit = editableFromNode(event.target, event.target);
      rememberFocus(hit);
    },
    true
  );

  document.addEventListener(
    "focusin",
    function (event) {
      const hit = editableFromNode(event.target, event.target);
      rememberFocus(hit);
    },
    true
  );

  function deepActive() {
    let el = document.activeElement;
    const seen = new Set();
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      if (seen.has(el)) break;
      seen.add(el);
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  function hostChain(el) {
    const out = [];
    let cur = el;
    while (cur) {
      out.push(cur);
      if (cur.parentElement) {
        cur = cur.parentElement;
        continue;
      }
      const root = cur.getRootNode && cur.getRootNode();
      cur = root && root.host ? root.host : null;
    }
    return out;
  }

  function queryEditableNodes(root) {
    if (!root || !root.querySelectorAll) return [];
    try {
      return Array.prototype.slice.call(root.querySelectorAll(EDITABLE_SELECTOR));
    } catch (err) {
      return [];
    }
  }

  function pickEditableCandidate(nodes, prefer) {
    const visible = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!isEditable(node) || !isVisible(node)) continue;
      visible.push(node);
      if (prefer && (node === prefer || node.contains(prefer))) return node;
    }
    if (prefer) {
      for (let j = 0; j < visible.length; j++) {
        if (visible[j].contains && visible[j].contains(prefer)) return visible[j];
      }
    }
    return visible.length === 1 ? visible[0] : null;
  }

  function findSearchField() {
    const candidates = [];
    for (let i = 0; i < SEARCH_SELECTORS.length; i++) {
      let nodes;
      try {
        nodes = document.querySelectorAll(SEARCH_SELECTORS[i]);
      } catch (err) {
        nodes = [];
      }
      for (let j = 0; j < nodes.length; j++) {
        candidates.push(nodes[j]);
      }
    }
    const fromQuery = queryEditableNodes(document);
    for (let k = 0; k < fromQuery.length; k++) {
      if (isSearchLikeInput(fromQuery[k])) candidates.push(fromQuery[k]);
    }
    const best = pickBestSearchField(candidates);
    if (best) return best;
    return null;
  }

  function editableFromNode(node, prefer) {
    if (!node || node.nodeType !== 1) return null;
    if (isEditable(node)) return node;
    if (isDiscoverable(node)) return node;
    const role = node.getAttribute && node.getAttribute("role");
    if (role === "combobox" || role === "search") {
      const inCombo = pickEditableCandidate(queryEditableNodes(node), prefer);
      if (inCombo) return inCombo;
    }
    const nested = pickEditableCandidate(queryEditableNodes(node), prefer);
    if (nested) return nested;
    if (node.shadowRoot) {
      const shadowActive = node.shadowRoot.activeElement;
      if (shadowActive) {
        const fromShadow = editableFromNode(shadowActive, prefer);
        if (fromShadow) return fromShadow;
      }
      const inShadow = pickEditableCandidate(queryEditableNodes(node.shadowRoot), prefer);
      if (inShadow) return inShadow;
    }
    return null;
  }

  function findEditable(path) {
    const prefer = deepActive();

    if (path && path.length) {
      for (let i = 0; i < path.length; i++) {
        const hit = editableFromNode(path[i], prefer);
        if (hit) return hit;
      }
    }

    if (prefer) {
      const direct = editableFromNode(prefer, prefer);
      if (direct) return direct;
      const chain = hostChain(prefer);
      for (let i = 0; i < chain.length; i++) {
        const hit = editableFromNode(chain[i], prefer);
        if (hit) return hit;
      }
    }

    const focused = document.activeElement;
    if (focused && focused !== prefer) {
      const alt = editableFromNode(focused, focused);
      if (alt) return alt;
    }

    return findSearchField();
  }

  function googleDocsIframe() {
    if (location.hostname.indexOf("docs.google.com") === -1) return null;
    return document.querySelector("iframe.docs-texteventtarget-iframe");
  }

  function isGoogleSearchHost() {
    const host = location.hostname.toLowerCase();
    return (
      host === "google.com" ||
      host.slice(-11) === ".google.com" ||
      /^google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) ||
      /\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)
    );
  }

  function googleSearchBox() {
    const selectors = [
      "textarea[name='q']",
      "input[name='q']",
      "textarea.gLFyf",
      "input.gLFyf",
      "#APjFqb",
      "form[action='/search'] textarea",
      "form[action='/search'] input[name='q']",
      "form[role='search'] textarea",
      "form[role='search'] input",
    ];
    const seen = [];
    for (let i = 0; i < selectors.length; i++) {
      let nodes;
      try {
        nodes = document.querySelectorAll(selectors[i]);
      } catch (err) {
        continue;
      }
      for (let j = 0; j < nodes.length; j++) {
        const el = nodes[j];
        if (seen.indexOf(el) !== -1) continue;
        seen.push(el);
        if (!isVisible(el)) continue;
        if (isTextInput(el) || el.isContentEditable) return el;
      }
    }
    return findSearchField();
  }

  function fieldContains(el, text) {
    if (!el || !text) return false;
    const needle = String(text).trim();
    if (!needle) return false;
    const value = isTextInput(el) ? el.value || "" : el.textContent || "";
    return value.indexOf(needle) !== -1;
  }

  function pasteInto(el, text) {
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const paste = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt,
      });
      return el.dispatchEvent(paste) !== false && fieldContains(el, text);
    } catch (err) {
      return false;
    }
  }

  function resolveTarget() {
    if (isGoogleSearchHost()) {
      const box = googleSearchBox();
      if (box) {
        targetEl = box;
        return box;
      }
    }
    if (targetEl && targetEl.isConnected && (isEditable(targetEl) || isDiscoverable(targetEl))) {
      return targetEl;
    }
    const active = deepActive();
    if (active) {
      const fromActive = editableFromNode(active, active);
      if (fromActive) {
        targetEl = fromActive;
        return targetEl;
      }
    }
    targetEl = findEditable() || findSearchField();
    return targetEl;
  }

  function unlockIfNeeded(el) {
    if (!el || !isTextInput(el) || !el.readOnly || !canUseReadonlySearch(el)) {
      return function () {};
    }
    el.readOnly = false;
    return function () {
      try {
        el.readOnly = true;
      } catch (err) {
        /* ignore */
      }
    };
  }

  function focusTarget(el) {
    const restoreReadonly = unlockIfNeeded(el);
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      try {
        el.focus();
      } catch (err2) {
        restoreReadonly();
        return false;
      }
    }
    restoreReadonly();
    return true;
  }

  function selectionFor(el) {
    const root = el.getRootNode ? el.getRootNode() : document;
    if (root.getSelection) return root.getSelection();
    return document.getSelection();
  }

  function nativeSetValue(el, value) {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function fireTyped(el, text) {
    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: "insertText",
      data: text,
    };
    try {
      el.dispatchEvent(new InputEvent("beforeinput", opts));
    } catch (err) {
      /* ignore */
    }
    try {
      el.dispatchEvent(new InputEvent("input", opts));
    } catch (err) {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    try {
      el.dispatchEvent(new Event("textInput", { bubbles: true, composed: true }));
    } catch (err2) {
      /* ignore */
    }
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified", code: "" }));
  }

  function precedingChar(el) {
    if (!el) return "";
    if (isTextInput(el)) {
      const pos = el.selectionStart || 0;
      const slice = (el.value || "").slice(0, pos).replace(/\s+$/, "");
      return slice.slice(-1);
    }
    const sel = selectionFor(el);
    if (!sel || !sel.focusNode) return (el.textContent || "").replace(/\s+$/, "").slice(-1);
    if (sel.focusNode.nodeType === 3) {
      const slice = (sel.focusNode.nodeValue || "").slice(0, sel.focusOffset).replace(/\s+$/, "");
      if (slice) return slice.slice(-1);
    }
    return (el.textContent || "").replace(/\s+$/, "").slice(-1);
  }

  function insertGoogleDocs(text) {
    const iframe = googleDocsIframe();
    if (!iframe) return false;
    let doc;
    try {
      doc = iframe.contentDocument;
    } catch (err) {
      return false;
    }
    if (!doc) return false;
    const el = doc.querySelector("[contenteditable='true']") || doc.body;
    if (!el) return false;
    try {
      el.focus();
    } catch (err) {
      /* ignore */
    }
    try {
      if (doc.execCommand("insertText", false, text)) return true;
    } catch (err) {
      /* fall through */
    }
    try {
      const event = doc.createEvent("TextEvent");
      event.initTextEvent("textInput", true, true, window, text);
      el.dispatchEvent(event);
      return true;
    } catch (err) {
      return false;
    }
  }

  function insertGoogleSearch(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;

    const box = googleSearchBox();
    if (!box) return false;

    targetEl = box;
    lastTarget = box;
    rememberFocus(box);

    if (box.readOnly) box.readOnly = false;
    try {
      box.focus({ preventScroll: true });
    } catch (err) {
      try {
        box.focus();
      } catch (err2) {
        return false;
      }
    }
    try {
      box.click();
    } catch (err) {
      /* ignore */
    }

    const suffix = /\s$/.test(text) ? " " : "";
    let inserted = false;

    if (isTextInput(box)) {
      const start = box.selectionStart == null ? box.value.length : box.selectionStart;
      const end = box.selectionEnd == null ? start : box.selectionEnd;
      const next = box.value.slice(0, start) + trimmed + suffix + box.value.slice(end);
      nativeSetValue(box, next);
      const pos = start + trimmed.length + suffix.length;
      try {
        box.setSelectionRange(pos, pos);
      } catch (err) {
        box.selectionStart = box.selectionEnd = pos;
      }
      fireTyped(box, trimmed + suffix);
      inserted = fieldContains(box, trimmed);
    } else if (box.isContentEditable) {
      const sel = selectionFor(box);
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(trimmed + suffix);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        box.textContent = (box.textContent || "") + trimmed + suffix;
      }
      fireTyped(box, trimmed + suffix);
      inserted = fieldContains(box, trimmed);
    }

    if (!inserted) {
      try {
        if (document.execCommand("insertText", false, trimmed + suffix)) {
          fireTyped(box, trimmed + suffix);
          inserted = fieldContains(box, trimmed);
        }
      } catch (err) {
        /* ignore */
      }
    }

    if (inserted) lastInserted = trimmed + suffix;
    return inserted;
  }

  function insertAsTyping(text) {
    if (!text) return false;

    if (isGoogleSearchHost()) {
      const box = googleSearchBox();
      if (box) {
        targetEl = box;
        lastFocusedEditable = box;
      }
    }

    const el = resolveTarget() || (isGoogleSearchHost() ? googleSearchBox() : null);
    if (!el && insertGoogleDocs(text)) {
      lastInserted = text;
      lastTarget = null;
      return true;
    }

    if (!el) {
      clipboardBuffer += text;
      if (isGoogleSearchHost()) {
        post("need-search", { text: String(text).trim() });
      }
      return false;
    }

    targetEl = el;
    lastTarget = el;
    rememberFocus(el);

    if (!focusTarget(el)) {
      clipboardBuffer += text;
      if (isGoogleSearchHost()) post("need-search", { text: String(text).trim() });
      return false;
    }

    const restoreReadonly = unlockIfNeeded(el);
    let inserted = false;

    try {
      if (document.execCommand("insertText", false, text) && fieldContains(el, text)) {
        fireTyped(el, text);
        inserted = true;
      }
    } catch (err) {
      /* fall through */
    }

    if (!inserted && pasteInto(el, text)) {
      fireTyped(el, text);
      inserted = true;
    }

    if (!inserted && isTextInput(el)) {
      const start = el.selectionStart == null ? el.value.length : el.selectionStart;
      const end = el.selectionEnd == null ? start : el.selectionEnd;
      nativeSetValue(el, el.value.slice(0, start) + text + el.value.slice(end));
      const pos = start + text.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch (err) {
        el.selectionStart = el.selectionEnd = pos;
      }
      fireTyped(el, text);
      inserted = fieldContains(el, text);
    }

    if (!inserted && !isTextInput(el)) {
      restoreReadonly();
      const sel = selectionFor(el);
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        fireTyped(el, text);
        inserted = true;
      } else {
        el.appendChild(document.createTextNode(text));
        fireTyped(el, text);
        inserted = true;
      }
      lastInserted = inserted ? text : lastInserted;
      if (!inserted && isGoogleSearchHost()) post("need-search", { text: String(text).trim() });
      return inserted;
    }

    restoreReadonly();
    if (inserted) {
      lastInserted = text;
      const snapshot = text;
      const field = el;
      setTimeout(function () {
        if (field.isConnected && fieldContains(field, snapshot)) return;
        if (isGoogleSearchHost()) post("need-search", { text: String(snapshot).trim() });
      }, 120);
      return true;
    }

    clipboardBuffer += text;
    if (isGoogleSearchHost()) post("need-search", { text: String(text).trim() });
    return false;
  }

  function fieldSnapshot(el) {
    if (!el) return "";
    if (isTextInput(el)) return el.value;
    return el.textContent || "";
  }

  function undoLast() {
    if (insertGoogleDocsUndo()) {
      lastInserted = "";
      return true;
    }
    const el = lastTarget && lastTarget.isConnected ? lastTarget : resolveTarget();
    const before = fieldSnapshot(el);
    try {
      if (document.execCommand("undo") && fieldSnapshot(el) !== before) {
        lastInserted = "";
        return true;
      }
    } catch (err) {
      /* fall through */
    }
    if (!el || !lastInserted) return false;
    const count = lastInserted.length;
    if (isTextInput(el)) {
      const end = el.selectionStart == null ? el.value.length : el.selectionStart;
      const start = Math.max(0, end - count);
      nativeSetValue(el, el.value.slice(0, start) + el.value.slice(end));
      try {
        el.setSelectionRange(start, start);
      } catch (err) {
        el.selectionStart = el.selectionEnd = start;
      }
      fireTyped(el, "");
      lastInserted = "";
      return true;
    }
    try {
      for (let i = 0; i < count; i++) document.execCommand("delete");
      lastInserted = "";
      return true;
    } catch (err) {
      return false;
    }
  }

  function insertGoogleDocsUndo() {
    const iframe = googleDocsIframe();
    if (!iframe) return false;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return false;
      return doc.execCommand("undo");
    } catch (err) {
      return false;
    }
  }

  function stablePrefix(text) {
    const index = text.lastIndexOf(" ");
    if (index === -1) return "";
    return text.slice(0, index + 1);
  }

  function polish(text) {
    if (!TextTools) return { text: text, undo: false };
    return TextTools.process(text, settings, { prevChar: precedingChar(resolveTarget()) });
  }

  function applyTranscript(text, isFinal) {
    const commitTo = isFinal ? text : stablePrefix(text);
    if (!commitTo && !isFinal) return;

    if (isFinal) {
      const processed = polish(text);
      if (processed.undo) {
        undoLast();
        pendingStable = "";
        return;
      }
      if (!processed.text || !String(processed.text).trim()) {
        pendingStable = "";
        return;
      }
      if (isGoogleSearchHost()) {
        if (insertGoogleSearch(processed.text)) {
          pendingStable = "";
          return;
        }
        post("need-search", { text: String(processed.text).trim() });
        pendingStable = "";
        return;
      }
      if (!pendingStable && processed.text) {
        insertAsTyping(processed.text);
        pendingStable = "";
        return;
      }
      if (processed.text.indexOf(pendingStable) === 0) {
        const delta = processed.text.slice(pendingStable.length);
        if (delta) insertAsTyping(delta);
        pendingStable = "";
        return;
      }
      insertAsTyping(processed.text);
      pendingStable = "";
      return;
    }

    if (commitTo.indexOf(pendingStable) === 0) {
      const delta = commitTo.slice(pendingStable.length);
      if (delta) insertAsTyping(delta);
      pendingStable = commitTo;
    }
  }

  function beginSession(path) {
    if (!siteEnabled()) return;
    holding = true;
    clipboardBuffer = "";
    pendingStable = "";
    lastInserted = "";
    if (isGoogleSearchHost()) {
      targetEl = googleSearchBox();
    }
    if (!targetEl) targetEl = findEditable(path) || findSearchField();
    if (targetEl) focusTarget(targetEl);
    post("target", { found: !!targetEl || !!googleDocsIframe() || isGoogleSearchHost() });
  }

  function endSession() {
    if (!holding) return;
    holding = false;
    pendingStable = "";
    post("session-ended", {
      clipboard: clipboardBuffer,
      inserted: !clipboardBuffer && !!lastInserted,
    });
    clipboardBuffer = "";
  }

  window.addEventListener(
    "keydown",
    function (event) {
      if (event.key === "Escape" && holding) {
        endSession();
        return;
      }
      if (!isHotkey(event) || event.repeat) return;
      if (window.top !== window) {
        try {
          if (!document.hasFocus()) return;
        } catch (err) {
          return;
        }
      }
      if (!siteEnabled()) return;
      if (Settings && Settings.shouldCaptureHotkey(settings)) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (holding && mode() === "toggle") {
        endSession();
        return;
      }
      if (holding) return;
      const path = event.composedPath ? event.composedPath() : [];
      beginSession(path);
    },
    true
  );

  window.addEventListener(
    "keyup",
    function (event) {
      if (!holding || mode() === "toggle") return;
      if (!isHotkey(event)) return;
      endSession();
    },
    true
  );

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && holding && mode() !== "toggle") endSession();
  });

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    if (data.role === "settings" && data.settings) {
      settings = Settings ? Settings.normalize(data.settings) : data.settings;
      return;
    }
    if (data.role === "client" && data.type === "chunk") {
      applyTranscript(data.text, data.isFinal);
      return;
    }
    if (data.role === "client" && data.type === "undo") {
      undoLast();
      return;
    }
    if (data.role === "client" && data.type === "end-session") {
      endSession();
    }
  });
})();
