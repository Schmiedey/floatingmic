# Voice Anywhere

On-device dictation for Chrome. Hold a key, speak, and type into any field. **Whisper runs inside the extension. Your voice never leaves this computer.**

## Why it exists

Most browser dictation sends audio to a cloud speech API. That fails on locked-down sites, needs a network, and means a vendor hears you. Voice Anywhere keeps the microphone stream and the model on-device.

## Selling points

- **Local / safety first** — default model is bundled. No speech account. No upload.
- **Works offline** after install.
- **Any text field** — search, email, tickets, many editors.
- **Hold or toggle**, with a key you choose.
- **Voice commands** like “new line” and “scratch that”.
- **Per-site off switch**.
- **History stays in Chrome**, on this profile.

## Load unpacked (development)

1. `npm run build` — downloads the speech model (~280 MB). Wait until it finishes.
2. `chrome://extensions` → Developer mode → **Load unpacked** → select **this project folder**
3. Click **Reload** on the Voice Anywhere card (important after updates)
4. Open the extension popup — wait until it says **Ready** (first launch can take up to a minute)
5. Click **Allow microphone** in the popup (opens a setup tab)
6. On Google or any site: click the search box, hold **Control**, speak, release

**Google search:** Click the search box first (or just hold Control on google.com — it auto-targets the search field). Text appears when you release Control.

If the popup shows a model error, run `npm run build` again and reload the extension.

## Chrome Web Store

See [store/listing.md](store/listing.md). Package with:

```bash
npm run build
npm run pack
```

Upload `dist/voice-anywhere.zip`. Host `store/privacy.html` on HTTPS and paste that URL as the privacy policy.

## Limits

- Will not run on `chrome://` pages or the Chrome Web Store
- Google Docs insert is best-effort
- Optional larger models download from Hugging Face only if you opt in
