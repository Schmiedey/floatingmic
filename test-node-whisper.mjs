import { pipeline } from "@huggingface/transformers";

const t0 = Date.now();
console.log("loading pipeline...");
const transcriber = await pipeline(
  "automatic-speech-recognition",
  "Xenova/whisper-base.en",
  { dtype: "q8" }
);
console.log("ready in", Date.now() - t0, "ms");

const result = await transcriber("https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav");
console.log("result", result);
