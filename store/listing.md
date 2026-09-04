# Chrome Web Store listing

Copy these fields into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Name
Voice Anywhere

## Summary (132 characters max)
On-device dictation for any text field. Whisper runs locally — your voice never leaves this computer.

## Category
Productivity

## Language
English

## Description

Voice Anywhere lets you hold a key, speak, and type into whatever field is focused — search boxes, emails, tickets, docs, and almost any input on the web.

The difference is where the work happens. Chrome’s built-in speech tools and most dictation extensions send audio to a cloud API. Voice Anywhere runs OpenAI’s Whisper model **inside the extension**. Microphone audio is transcribed on your computer. It is not uploaded. There is no account.

**Why people install it**

- **Local first.** Default English model is bundled. After install, it works offline.
- **Safety first.** No speech vendor, no training on your voice, no analytics SDK.
- **Works where cloud dictation fails.** Sites that block Web Speech still get text at the cursor.
- **Any field.** Search boxes, comboboxes, contenteditable editors, and many shadow-DOM inputs.
- **Hold or toggle.** Control, Alt, Caps Lock, F8, or a key you choose.
- **Voice commands.** “new line”, “period”, “comma”, “scratch that”.
- **Per-site off switch.** Disable it on a page from the popup.
- **History stays here.** Recent transcripts live in your Chrome profile so you can copy or undo.

**How to use it**

1. Click the extension icon and allow the microphone (Chrome cannot ask inside the popup).
2. Click a text field.
3. Hold Control, speak, release. Text is inserted at the cursor.

Open Settings to change the hotkey, switch to toggle mode, or pick a larger model. Larger models are optional downloads from Hugging Face. Audio is still transcribed on-device after that file is cached.

Google Docs uses a custom editor, so insert there is best-effort. The extension cannot run on chrome:// pages or the Chrome Web Store.

## Single purpose
On-device voice dictation into text fields.

## Permission justifications

**storage**  
Saves hotkey, site allow/block lists, and a short local dictation history. No server.

**offscreen**  
Runs the Whisper engine and microphone recorder in an offscreen document so web pages cannot see the audio graph.

**clipboardWrite**  
If no text field is focused, the transcript is copied locally so it is not lost.

**Optional host permissions (Hugging Face)**  
Requested only if the user picks a non-bundled model. Used solely to download that model file. Not used to upload audio.

## Privacy questionnaire

- User data? Microphone audio is processed locally and discarded. Settings and local history stay in Chrome storage.
- Remote code? No. All scripts ship in the package.
- Sold to third parties? No.
- Used for purposes unrelated to the extension? No.

## Assets
- Store icon: `icons/icon128.png`
- Screenshots: `store/screenshots/` (1280×800)
  - 01-dictate.png
  - 02-popup.png
  - 03-privacy.png
  - 04-fields.png
  - 05-commands.png
- Small promo: `store/screenshots/promo-small.png` (440×280)
- Marquee: `store/screenshots/promo-marquee.png` (1400×560)
- Privacy policy: https://gist.github.com/Schmiedey/2d3bb0191328cdc67764e92cac6596a4

## Publish steps

1. Pay the one-time Chrome Web Store developer fee if needed.
2. Host `store/privacy.html` (GitHub Pages is enough).
3. `npm run pack` and upload `dist/voice-anywhere.zip`.
4. Paste the listing copy, screenshots, and privacy URL.
5. Submit for review.
