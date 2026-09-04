import { pipeline, env } from "@huggingface/transformers";

function wasmFile(name) {
  return new URL("../wasm/" + name, import.meta.url).href;
}

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: wasmFile("ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: wasmFile("ort-wasm-simd-threaded.asyncify.wasm"),
};

const out = document.getElementById("out");
function log(line) {
  out.textContent += "\n" + line;
  console.log(line);
}

async function main() {
  try {
    log("loading model");
    const transcriber = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-base.en",
      {
        device: "wasm",
        dtype: "fp32",
        progress_callback: (info) => {
          if (info && info.status === "progress") {
            log("progress " + Math.round(info.progress || 0) + "% " + (info.file || ""));
          } else if (info && info.status) {
            log("status " + info.status);
          }
        },
      }
    );
    log("model ready");
    const audio = await fetch("/test/jfk.wav").then((r) => r.arrayBuffer());
    const ctx = new AudioContext({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(audio.slice(0));
    const pcm = decoded.getChannelData(0);
    log("audio samples " + pcm.length);
    const result = await transcriber(pcm);
    const text = typeof result === "string" ? result : result.text;
    log("TRANSCRIPT=" + text);
    window.__VA_OK = true;
    window.__VA_TEXT = text;
  } catch (err) {
    log("ERROR " + (err && err.stack ? err.stack : err));
    window.__VA_OK = false;
    window.__VA_ERROR = String(err && err.message ? err.message : err);
  }
}

void main();
