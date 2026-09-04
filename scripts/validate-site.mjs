import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = process.cwd();
const htmlFiles = ["index.html", "generator.html", "dashboard.html"];
const jsFiles = [
  "assets/js/config.js",
  "assets/js/api.js",
  "assets/js/common.js",
  "assets/js/qr-payload.js",
  "assets/js/scanner.js",
  "assets/js/generator.js",
  "assets/js/dashboard.js",
];

const errors = [];
for (const file of [...htmlFiles, ...jsFiles, "assets/css/styles.css", "assets/img/psu-logo.png", "assets/img/usg-logo.png", "assets/img/id-card-art.svg"]) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing required file: ${file}`);
}

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(path.join(root, htmlFile), "utf8");
  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((match) => match[1]);
  refs.filter((ref) => !/^(?:https?:|mailto:|tel:)/.test(ref)).forEach((ref) => {
    if (!fs.existsSync(path.resolve(root, path.dirname(htmlFile), ref))) errors.push(`${htmlFile} references missing file: ${ref}`);
  });
  if (!/<meta name="viewport"/.test(html)) errors.push(`${htmlFile} is missing a viewport meta tag.`);
}

for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (check.status !== 0) errors.push(`${file}: ${check.stderr.trim()}`);
}

try {
  new vm.Script(fs.readFileSync(path.join(root, "google-apps-script/Code.gs"), "utf8"), { filename: "Code.gs" });
} catch (error) {
  errors.push(`google-apps-script/Code.gs: ${error.message}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Static entrypoints, local assets, browser JavaScript, and Apps Script syntax are valid.");
