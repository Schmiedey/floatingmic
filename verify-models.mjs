import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const modelName = "whisper-base.en";
const modelDir = path.join(root, "models", "Xenova", modelName);
const required = [
  { rel: "config.json", min: 100 },
  { rel: "tokenizer.json", min: 100000 },
  { rel: "preprocessor_config.json", min: 50 },
  { rel: "onnx/encoder_model.onnx", min: 50000000 },
  { rel: "onnx/decoder_model_merged.onnx", min: 100000000 },
];

let failed = false;
for (const file of required) {
  const full = path.join(modelDir, file.rel);
  if (!fs.existsSync(full)) {
    console.error("missing", file.rel);
    failed = true;
    continue;
  }
  const size = fs.statSync(full).size;
  if (size < file.min) {
    console.error("too small", file.rel, size, "expected >=", file.min);
    failed = true;
    continue;
  }
  console.log("ok", file.rel, size);
}

if (failed) {
  console.error("\nSpeech model is incomplete. Run: npm run build");
  process.exit(1);
}

console.log("bundled model ready:", modelDir);
