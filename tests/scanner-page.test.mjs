import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const scannerPage = fs.readFileSync(new URL("../scanner.html", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../assets/js/api.js", import.meta.url), "utf8");

test("scanner-only page does not expose organizer navigation", () => {
  assert.doesNotMatch(scannerPage, /href=["'][^"']*(?:generator|dashboard)\.html/i);
  assert.doesNotMatch(scannerPage, /<nav\b/i);
  assert.match(scannerPage, /name="robots" content="noindex, nofollow"/i);
});

test("shared checker link targets scanner-only page without a control-code parameter", () => {
  assert.match(apiSource, /new URL\("scanner\.html", location\.href\)/);
  assert.doesNotMatch(apiSource, /searchParams\.set\(["'](?:code|controlCode)["']/);
});

test("scanner-only page includes student attendance report controls", () => {
  assert.match(scannerPage, /id="attendance-report"/);
  assert.match(scannerPage, /id="print-report"/);
  assert.match(scannerPage, /id="download-report"/);
});
