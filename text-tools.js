(function (root) {
  "use strict";

  var UNDO_RE = /^\s*(scratch that|undo that|delete that|undo)\s*$/i;

  var COMMANDS = [
    [/[ \t]*(new paragraph|next paragraph)[ \t]*/gi, "\n\n"],
    [/[ \t]*(new line|newline|next line|line break)[ \t]*/gi, "\n"],
    [/[ \t]*(question mark)[ \t]*/gi, "? "],
    [/[ \t]*(exclamation (?:mark|point))[ \t]*/gi, "! "],
    [/[ \t]*(full stop|period)[ \t]*/gi, ". "],
    [/[ \t]*(comma)[ \t]*/gi, ", "],
    [/[ \t]*(semi colon|semicolon)[ \t]*/gi, "; "],
    [/[ \t]*(colon)[ \t]*/gi, ": "],
    [/[ \t]*(open quote)[ \t]*/gi, "\u201c"],
    [/[ \t]*(close quote)[ \t]*/gi, "\u201d"],
    [/[ \t]*(apostrophe)[ \t]*/gi, "'"],
    [/[ \t]*(ellipsis|dot dot dot)[ \t]*/gi, "... "],
    [/[ \t]*(hyphen|dash)[ \t]*/gi, "-"],
  ];

  function applyVoiceCommands(text) {
    var raw = String(text || "");
    if (UNDO_RE.test(raw)) {
      return { text: "", undo: true };
    }
    var next = raw.replace(/\b(scratch that|undo that|delete that)\b/gi, " ");
    for (var i = 0; i < COMMANDS.length; i++) {
      next = next.replace(COMMANDS[i][0], COMMANDS[i][1]);
    }
    next = next.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
    next = next.replace(/[ ]{2,}/g, " ");
    return { text: next, undo: false };
  }

  function applyPunctuation(text) {
    var next = String(text || "");
    next = next.replace(/\s+([.,!?;:])/g, "$1");
    next = next.replace(/([.,!?;:])([^\s\n”’])/g, "$1 $2");
    next = next.replace(/\bi'm\b/gi, "I'm");
    next = next.replace(/\bi've\b/gi, "I've");
    next = next.replace(/\bi'd\b/gi, "I'd");
    next = next.replace(/\bi'll\b/gi, "I'll");
    next = next.replace(/\bi\b/g, "I");
    return next;
  }

  function shouldCapitalizeFrom(prevChar) {
    if (!prevChar) return true;
    return /[.!?\n]/.test(prevChar);
  }

  function capitalizeText(text, prevChar) {
    var capNext = shouldCapitalizeFrom(prevChar);
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (capNext && /[a-z]/.test(ch)) {
        out += ch.toUpperCase();
        capNext = false;
        continue;
      }
      out += ch;
      if (/[.!?]/.test(ch)) capNext = true;
      else if (ch === "\n") capNext = true;
      else if (!/\s/.test(ch)) capNext = false;
    }
    return out;
  }

  var HALLUCINATION_RE =
    /^(you|you\.|thank you\.?|thanks\.?|thanks for watching(?: this video)?\.?|subtitle\.?|music\.?|\[music\]|\[silence\])$/i;

  function normalizeHallucination(text) {
    return String(text || "")
      .trim()
      .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
      .replace(/[.!?,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function isLikelyHallucination(text) {
    var s = normalizeHallucination(text);
    if (!s) return true;
    if (s.length <= 2) return true;
    return HALLUCINATION_RE.test(s) || s === "you";
  }

  function process(text, settings, context) {
    var s = String(text || "");
    var opts = settings || {};
    if (opts.voiceCommands !== false) {
      var commanded = applyVoiceCommands(s);
      if (commanded.undo) return { text: "", undo: true };
      s = commanded.text;
    }
    if (opts.punctuation !== false) {
      s = applyPunctuation(s);
    }
    if (opts.autoCapitalize !== false) {
      s = capitalizeText(s, context && context.prevChar);
    }
    if (isLikelyHallucination(s)) {
      return { text: "", undo: false };
    }
    return { text: s, undo: false };
  }

  root.VoiceAnywhereText = {
    applyVoiceCommands: applyVoiceCommands,
    applyPunctuation: applyPunctuation,
    capitalizeText: capitalizeText,
    isLikelyHallucination: isLikelyHallucination,
    process: process,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
