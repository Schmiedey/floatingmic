import { pipeline, env } from "@huggingface/transformers";

function wasmFile(name) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL("wasm/" + name);
  }
  return new URL("../wasm/" + name, import.meta.url).href;
}

env.allowRemoteModels = true;
env.useBrowserCache = false;
env.useWasmCache = false;
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
  env.allowLocalModels = true;
  env.localModelPath = chrome.runtime.getURL("models/");
} else {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
}
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: wasmFile("ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: wasmFile("ort-wasm-simd-threaded.asyncify.wasm"),
};

const out = document.getElementById("out");
function log(line) {
  out.textContent += "\n" + line;
}

async function main() {
  try {
    log("loading");
    const transcriber = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-base.en",
      { device: "wasm", dtype: "fp32" }
    );
    log("model ready");
    const url =
      typeof chrome !== "undefined" && chrome.runtime
        ? chrome.runtime.getURL("samples/jfk.wav")
        : "/test/jfk.wav";
    const audio = await fetch(url).then((r) => r.arrayBuffer());
    const ctx = new AudioContext({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(audio.slice(0));
    const result = await transcriber(decoded.getChannelData(0));
    const text = typeof result === "string" ? result : result.text;
    log("TRANSCRIPT=" + text);
    window.__VA_OK = /ask not what your country/i.test(text);
    window.__VA_TEXT = text;
  } catch (err) {
    log("ERROR " + (err && err.message ? err.message : err));
    window.__VA_OK = false;
    window.__VA_ERROR = String(err && err.message ? err.message : err);
  }
}

void main();
