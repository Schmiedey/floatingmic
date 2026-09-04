import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const staging = path.join(dist, "voice-anywhere");
const zip = path.join(dist, "voice-anywhere.zip");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDirFiltered(from, to, allow) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (allow && !allow(name)) continue;
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDirFiltered(src, dest, null);
    else copyFile(src, dest);
  }
}

const files = [
  "manifest.json",
  "background.js",
  "content.js",
  "speech-page.js",
  "settings.js",
  "text-tools.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "setup.html",
  "setup.js",
  "offscreen.html",
  "offscreen-entry.js",
  "offscreen.js",
  "ui.css",
  "overlay.css",
];

for (const file of files) {
  copyFile(path.join(root, file), path.join(staging, file));
}

copyDirFiltered(path.join(root, "icons"), path.join(staging, "icons"), function (name) {
  return name.endsWith(".png");
});
copyDirFiltered(path.join(root, "models"), path.join(staging, "models"));
copyDirFiltered(path.join(root, "wasm"), path.join(staging, "wasm"), function (name) {
  return name.indexOf("asyncify") !== -1;
});

execFileSync("zip", ["-X", "-r", zip, "."], {
  cwd: staging,
  env: Object.assign({}, process.env, { COPYFILE_DISABLE: "1" }),
});

const bytes = fs.statSync(zip).size;
console.log("wrote", zip, (bytes / (1024 * 1024)).toFixed(1) + " MB");
