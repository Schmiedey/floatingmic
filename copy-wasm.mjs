import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(root, "wasm");
const src = path.join(root, "node_modules", "onnxruntime-web", "dist");

fs.mkdirSync(dest, { recursive: true });

for (const name of fs.readdirSync(src)) {
  if (!name.startsWith("ort-wasm")) continue;
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}

console.log("copied wasm assets to", dest);
