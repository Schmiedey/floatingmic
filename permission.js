(function () {
  "use strict";

  const button = document.getElementById("enable");
  const status = document.getElementById("status");
  const SpeechRecognitionCtor =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  function setStatus(text) {
    status.textContent = text;
  }

  async function enable() {
    button.disabled = true;
    setStatus("Requesting microphone…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    } catch (err) {
      button.disabled = false;
      setStatus("Microphone blocked. Allow it in Chrome settings, then try again.");
      return;
    }

    if (
      SpeechRecognitionCtor &&
      typeof SpeechRecognitionCtor.install === "function"
    ) {
      setStatus("Downloading on-device speech model…");
      try {
        const lang = navigator.language || "en-US";
        await SpeechRecognitionCtor.install({
          langs: lang === "en-US" ? ["en-US"] : [lang, "en-US"],
          processLocally: true,
        });
      } catch (err) {
        setStatus("Microphone is on. Speech model will finish later — you can close this tab.");
        chrome.runtime.sendMessage({ type: "permission-granted" });
        return;
      }
    }

    setStatus("Ready. Go back to your tab and hold Control to dictate.");
    chrome.runtime.sendMessage({ type: "permission-granted" });
    button.textContent = "Enabled";
  }

  button.addEventListener("click", function () {
    void enable();
  });
})();
