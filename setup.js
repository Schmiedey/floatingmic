(function () {
  "use strict";

  const button = document.getElementById("enable");
  const status = document.getElementById("status");
  const help = document.getElementById("help");

  function setStatus(text) {
    status.textContent = text;
  }

  async function enable() {
    button.disabled = true;
    document.body.classList.remove("is-help");
    setStatus("Loading speech model… first time can take up to a minute.");

    try {
      const state = await chrome.runtime.sendMessage({ type: "warmup" });
      const engine = state && state.engine ? state.engine : null;
      if (!engine || !engine.ready) {
        const msg = engine && engine.message ? engine.message : "Speech engine did not start";
        if (/not installed|npm run build/i.test(msg)) {
          setStatus(msg);
        } else {
          setStatus("Speech engine is still loading. Keep this tab open, then try again.");
        }
        button.disabled = false;
        document.body.classList.add("is-help");
        return;
      }
    } catch (err) {
      setStatus("Could not start the speech engine. Reload the extension and try again.");
      button.disabled = false;
      document.body.classList.add("is-help");
      return;
    }

    setStatus("Waiting for Chrome’s microphone prompt…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    } catch (err) {
      button.disabled = false;
      document.body.classList.add("is-help");
      const name = err && err.name ? err.name : "";
      if (name === "NotFoundError") {
        setStatus("No microphone was found.");
      } else if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus("Microphone was denied. Use the checklist below, then try again.");
      } else {
        setStatus("Could not open the microphone (" + (name || "error") + ").");
      }
      return;
    }

    setStatus("Ready. Go to Google or any site, click a search box, hold Control, and speak.");
    chrome.runtime.sendMessage({ type: "permission-granted" });
    button.textContent = "Enabled";
  }

  button.addEventListener("click", function () {
    void enable();
  });
})();
