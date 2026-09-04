import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const modelName = "whisper-base.en";
const dest = path.join(root, "models", "Xenova", modelName);
const onnxDir = path.join(dest, "onnx");
const cache = path.join(
  root,
  "node_modules",
  "@huggingface",
  "transformers",
  ".cache",
  "Xenova",
  modelName
);
const baseUrl = "https://huggingface.co/Xenova/" + modelName + "/resolve/main/";

fs.mkdirSync(onnxDir, { recursive: true });

async function ensureFile(rel, minSize) {
  const out = path.join(dest, rel);
  const fromCache = path.join(cache, rel);
  if (fs.existsSync(fromCache)) {
    fs.copyFileSync(fromCache, out);
    console.log("cached", rel);
    return;
  }
  if (fs.existsSync(out) && (!minSize || fs.statSync(out).size >= minSize)) {
    console.log("have", rel, fs.statSync(out).size);
    return;
  }
  const url = baseUrl + rel;
  console.log("download", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed " + url + " " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log("wrote", rel, buf.length);
}

for (const name of [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "preprocessor_config.json",
  "generation_config.json",
]) {
  await ensureFile(name);
}

for (const rel of ["onnx/encoder_model.onnx", "onnx/decoder_model_merged.onnx"]) {
  await ensureFile(rel, 1000000);
}

console.log("models ready at", dest);
