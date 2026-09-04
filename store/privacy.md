# Voice Anywhere privacy policy

Last updated September 3, 2026.

Voice Anywhere is a Chrome extension for dictating into text fields. **Speech is transcribed on your computer.** There is no Voice Anywhere account, server, or analytics pipeline.

## What we do not collect

- We do not upload microphone audio.
- We do not upload transcripts.
- We do not sell data, show ads, or train models on your voice.
- We do not require an email or login.

## What stays on your device

- **Microphone audio** is recorded in an extension offscreen document, transcribed with an on-device Whisper model, then discarded.
- **Settings** (hotkey, site lists, model choice) are stored in Chrome storage. If you use Chrome Sync, Google may sync those settings with your other Chrome profiles. Voice Anywhere does not receive a copy.
- **Recent dictation history** stays in Chrome on this profile so you can copy or undo.

## Network use

The default English model ships inside the extension. After install, dictation works without the internet.

If you opt into a larger or multilingual model, Chrome will ask for permission to download that model from Hugging Face. That download is optional. Audio is still transcribed locally after the file is cached.

## Permissions

- **storage** — save settings and local history.
- **offscreen** — run the speech engine away from the web page.
- **clipboardWrite** — copy text if no field is focused.
- **Optional Hugging Face access** — only if you choose a downloadable model.

The extension injects a small script into websites so it can type into the focused field after you hold your hotkey. It does not read the page for advertising or tracking.

## Contact

For privacy questions, use the support email listed on the Chrome Web Store listing.
