import { pipeline, env } from "@huggingface/transformers";

function wasmFile(name) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL("wasm/" + name);
  }
  return new URL("../wasm/" + name, import.meta.url).href;
}

env.allowRemoteModels = false;
env.useBrowserCache = true;
env.useWasmCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: wasmFile("ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: wasmFile("ort-wasm-simd-threaded.asyncify.wasm"),
};

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
  env.allowLocalModels = true;
  env.localModelPath = chrome.runtime.getURL("models/");
} else {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
}

const BUNDLED_MODEL = "Xenova/whisper-base.en";

let modelId = BUNDLED_MODEL;
let language = "en";

const Speech = {
  wantRecord: false,
  startGen: 0,
  stream: null,
  recorder: null,
  chunks: [],
  transcriber: null,
  loadedModel: "",
  loading: null,
  audioCtx: null,
  analyser: null,
  freqBuf: null,
  timeBuf: null,
  levelTimer: 0,
  peakRms: 0,
};

const HALLUCINATION_RE =
  /^(you|you\.|thank you\.?|thanks\.?|thanks for watching(?: this video)?\.?|subtitle\.?|music\.?|\[music\]|\[silence\])$/i;

const MIN_SPEECH_RMS = 0.14;

function normalizeHallucination(text) {
  return String(text || "")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function audioRms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  const step = samples.length > 16000 ? Math.floor(samples.length / 8000) : 1;
  let count = 0;
  for (let i = 0; i < samples.length; i += step) {
    const v = samples[i];
    sum += v * v;
    count += 1;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function isEmptySpeech(text) {
  const s = normalizeHallucination(text);
  if (!s) return true;
  if (s.length <= 2) return true;
  return HALLUCINATION_RE.test(s) || s === "you";
}

let emitFn = function () {};

export function setEmitter(fn) {
  emitFn = fn;
}

function emit(event, payload) {
  emitFn(event, payload);
}

function fail(err) {
  const detail = err && err.message ? err.message : String(err || "unknown error");
  emit("error", { error: "model-failed", detail: detail });
}

export function configure(options) {
  const nextModel = options && options.modelId ? options.modelId : modelId;
  const nextLang = options && options.language ? options.language : language;
  if (nextModel !== modelId) {
    Speech.transcriber = null;
    Speech.loadedModel = "";
    Speech.loading = null;
  }
  modelId = nextModel;
  language = nextLang;
  env.allowRemoteModels = modelId !== BUNDLED_MODEL;
}

export async function preload() {
  try {
    await getTranscriber();
  } catch (err) {
    /* fail() already emitted */
  }
}

async function ensureBundledModelFiles() {
  if (modelId !== BUNDLED_MODEL || typeof chrome === "undefined" || !chrome.runtime?.getURL) {
    return;
  }
  const base = chrome.runtime.getURL("models/");
  const checks = [
    `${BUNDLED_MODEL}/config.json`,
    `${BUNDLED_MODEL}/onnx/encoder_model.onnx`,
    `${BUNDLED_MODEL}/onnx/decoder_model_merged.onnx`,
  ];
  for (const rel of checks) {
    const url = base + rel;
    let res;
    try {
      res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    } catch (err) {
      throw new Error(
        "Speech model not installed. Open the extension folder in Terminal, run npm run build, then reload the extension in chrome://extensions."
      );
    }
    if (!res.ok && res.status !== 206) {
      throw new Error(
        "Speech model not installed. Open the extension folder in Terminal, run npm run build, then reload the extension in chrome://extensions."
      );
    }
  }
}

async function getTranscriber() {
  const wanted = modelId;
  if (Speech.transcriber && Speech.loadedModel === wanted) return Speech.transcriber;
  if (Speech.loading && Speech.loadedModel === wanted) return Speech.loading;

  emit("status", { message: "Loading speech engine…" });

  try {
    await ensureBundledModelFiles();
  } catch (err) {
    fail(err);
    throw err;
  }

  Speech.loadedModel = wanted;
  Speech.loading = pipeline("automatic-speech-recognition", wanted, {
    device: "wasm",
    dtype: "fp32",
    local_files_only: wanted === BUNDLED_MODEL,
    progress_callback: function (info) {
      if (!info) return;
      if (info.status === "progress" && info.progress != null) {
        const name = info.file ? String(info.file).split("/").pop() : "model";
        emit("status", {
          message: "Downloading " + name + " " + Math.round(info.progress) + "%",
        });
        if (info.progress >= 100) {
          emit("status", { message: "Starting speech engine…" });
        }
      } else if (info.status === "done" || info.status === "ready") {
        emit("status", { message: "Starting speech engine…" });
      }
    },
  })
    .then(function (model) {
      if (modelId !== wanted) {
        Speech.loading = null;
        return getTranscriber();
      }
      Speech.transcriber = model;
      Speech.loadedModel = wanted;
      Speech.loading = null;
      emit("status", { message: "Speech engine ready" });
      emit("ready", { modelId: wanted });
      return model;
    })
    .catch(function (err) {
      Speech.loading = null;
      if (Speech.loadedModel === wanted) Speech.loadedModel = "";
      fail(err);
      throw err;
    });

  return Speech.loading;
}

async function blobToAudio(blob) {
  const buffer = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const copy = new Float32Array(channel.length);
    copy.set(channel);
    return copy;
  } finally {
    await ctx.close().catch(function () {});
  }
}

async function transcribeBlob(blob) {
  if (!blob || blob.size < 400) return "";
  const peak = Speech.peakRms;
  if (peak > 0 && peak < MIN_SPEECH_RMS) return "";
  const audio = await blobToAudio(blob);
  if (audio.length < 8000) return "";
  const rms = audioRms(audio);
  if (rms < 0.018) return "";
  const model = await getTranscriber();
  const options = {
    condition_on_prev_tokens: false,
    no_speech_threshold: 0.6,
    compression_ratio_threshold: 2.2,
    logprob_threshold: -1.0,
  };
  if (!/\.en$/i.test(modelId) && language && language !== "auto" && language !== "en") {
    options.language = language;
    options.task = "transcribe";
  } else if (!/\.en$/i.test(modelId) && language === "en") {
    options.language = "en";
    options.task = "transcribe";
  }
  const result = await model(audio, options);
  const text = typeof result === "string" ? result : result && result.text;
  const trimmed = (text || "").trim();
  if (isEmptySpeech(trimmed)) return "";
  if (peak > 0 && peak < MIN_SPEECH_RMS) return "";
  if (rms < 0.03 && trimmed.split(/\s+/).length <= 3) return "";
  return trimmed;
}

function stopVisualizer() {
  if (Speech.levelTimer) {
    clearTimeout(Speech.levelTimer);
    Speech.levelTimer = 0;
  }
  Speech.analyser = null;
  Speech.freqBuf = null;
  Speech.timeBuf = null;
  if (Speech.audioCtx) {
    const ctx = Speech.audioCtx;
    Speech.audioCtx = null;
    void ctx.close().catch(function () {});
  }
}

function bandLevel(freq, start, end) {
  let sum = 0;
  let count = 0;
  const last = Math.min(freq.length - 1, end);
  for (let i = start; i <= last; i++) {
    sum += freq[i];
    count += 1;
  }
  if (!count) return 0.08;
  return Math.max(0.08, Math.min(1, Math.pow(sum / count / 255, 0.65)));
}

function readLevels() {
  const analyser = Speech.analyser;
  if (!analyser || !Speech.freqBuf || !Speech.timeBuf) {
    return { levels: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], rms: 0 };
  }
  analyser.getByteFrequencyData(Speech.freqBuf);
  analyser.getByteTimeDomainData(Speech.timeBuf);
  let power = 0;
  for (let i = 0; i < Speech.timeBuf.length; i++) {
    const v = (Speech.timeBuf[i] - 128) / 128;
    power += v * v;
  }
  const rms = Math.min(1, Math.sqrt(power / Speech.timeBuf.length) * 4);
  const freq = Speech.freqBuf;
  const levels = [
    bandLevel(freq, 2, 4),
    bandLevel(freq, 4, 7),
    bandLevel(freq, 7, 11),
    bandLevel(freq, 11, 16),
    bandLevel(freq, 16, 22),
    bandLevel(freq, 22, 30),
    bandLevel(freq, 30, 42),
  ];
  if (rms > 0.04) {
    for (let i = 0; i < levels.length; i++) {
      levels[i] = Math.min(1, levels[i] * (0.55 + rms * 1.4) + rms * (0.08 + i * 0.01));
    }
  }
  return { levels: levels, rms: rms };
}

function pumpLevels() {
  if (!Speech.wantRecord || !Speech.analyser) return;
  const reading = readLevels();
  if (reading.rms > Speech.peakRms) Speech.peakRms = reading.rms;
  emit("levels", reading);
  Speech.levelTimer = setTimeout(pumpLevels, 45);
}

async function startVisualizer(stream) {
  const gen = Speech.startGen;
  stopVisualizer();
  try {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (gen !== Speech.startGen || !Speech.wantRecord) {
      await ctx.close().catch(function () {});
      return;
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    const mute = ctx.createGain();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.48;
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(ctx.destination);
    Speech.audioCtx = ctx;
    Speech.analyser = analyser;
    Speech.freqBuf = new Uint8Array(analyser.frequencyBinCount);
    Speech.timeBuf = new Uint8Array(analyser.fftSize);
    pumpLevels();
  } catch (err) {
    stopVisualizer();
  }
}

function stopMedia() {
  stopVisualizer();
  if (Speech.recorder && Speech.recorder.state !== "inactive") {
    try {
      Speech.recorder.stop();
    } catch (err) {
      /* ignore */
    }
  }
  Speech.recorder = null;
  if (Speech.stream) {
    Speech.stream.getTracks().forEach(function (track) {
      track.stop();
    });
    Speech.stream = null;
  }
}

function waitForRecorderStop(recorder) {
  return new Promise(function (resolve) {
    let finished = false;
    function done() {
      if (finished) return;
      finished = true;
      resolve(new Blob(Speech.chunks, { type: recorder.mimeType || "audio/webm" }));
    }
    recorder.onstop = done;
    recorder.onerror = done;
    try {
      if (recorder.state === "recording") {
        try {
          recorder.requestData();
        } catch (err) {
          /* ignore */
        }
        recorder.stop();
      } else {
        done();
        return;
      }
    } catch (err) {
      done();
      return;
    }
    setTimeout(done, 1000);
  });
}

async function startRecording() {
  const gen = ++Speech.startGen;
  Speech.wantRecord = true;
  emit("status", { message: "Listening…" });

  if (Speech.recorder) return;

  let stream;
  try {
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      }),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error("Microphone timed out"));
        }, 8000);
      }),
    ]);
  } catch (err) {
    if (gen !== Speech.startGen || !Speech.wantRecord) return;
    const name =
      err && err.name === "NotAllowedError"
        ? "not-allowed"
        : err && /timed out/i.test(err.message || "")
          ? "start-failed"
          : "audio-capture";
    emit("error", { error: name, detail: err && err.message });
    Speech.wantRecord = false;
    return;
  }

  if (gen !== Speech.startGen || !Speech.wantRecord) {
    stream.getTracks().forEach(function (track) {
      track.stop();
    });
    return;
  }

  Speech.stream = stream;
  Speech.chunks = [];
  Speech.peakRms = 0;
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
  Speech.recorder = mime
    ? new MediaRecorder(Speech.stream, { mimeType: mime })
    : new MediaRecorder(Speech.stream);
  Speech.recorder.ondataavailable = function (event) {
    if (event.data && event.data.size > 0) Speech.chunks.push(event.data);
  };
  Speech.recorder.start(200);
  void startVisualizer(stream);
  emit("started");
}

async function stopRecording() {
  Speech.wantRecord = false;
  Speech.startGen += 1;

  const recorder = Speech.recorder;
  if (!recorder) {
    stopMedia();
    emit("ended");
    return;
  }

  const blob = await waitForRecorderStop(recorder);
  const peak = Speech.peakRms;
  stopMedia();
  Speech.chunks = [];

  if (peak > 0 && peak < MIN_SPEECH_RMS) {
    emit("ended");
    return;
  }

  emit("status", { message: "Transcribing…" });
  try {
    const text = await transcribeBlob(blob);
    if (text) emit("chunk", { text: text + " ", isFinal: true });
  } catch (err) {
    fail(err);
    return;
  }
  emit("ended");
}

export function dispatch(message) {
  if (message.type === "engine-start") {
    void startRecording();
  } else if (message.type === "engine-stop") {
    void stopRecording();
  } else if (message.type === "engine-configure") {
    configure(message);
    void preload();
  }
}
