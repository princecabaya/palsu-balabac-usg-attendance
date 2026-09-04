import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
const context = {
  console,
  Date,
  Math,
  JSON,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest(_algorithm, value) {
      return [...crypto.createHash("sha256").update(String(value), "utf8").digest()].map((byte) => byte > 127 ? byte - 256 : byte);
    },
    getUuid() { return crypto.randomUUID(); },
    parseDate(value) { return new Date(`${value}:00+08:00`); },
  },
};
vm.createContext(context);
new vm.Script(source, { filename: "Code.gs" }).runInContext(context);

test("Apps Script hash matches browser-compatible SHA-256 hex", () => {
  const expected = crypto.createHash("sha256").update("control-code", "utf8").digest("hex");
  assert.equal(context.hash_("control-code"), expected);
});

test("Apps Script reads the official QR payload", () => {
  const payload = JSON.stringify({ a: "PSU-USG", v: 1, s: "2026-10-0007bl" });
  assert.equal(context.studentNumberFromQr_(payload), "2026-10-0007BL");
  assert.equal(context.studentNumberFromQr_("unrelated"), "");
});

test("Apps Script normalizes all three program families", () => {
  assert.equal(context.normalizeProgram_("BEEd"), "BEEd");
  assert.equal(context.normalizeProgram_("Entrepreneurship"), "BSE");
  assert.equal(context.normalizeProgram_("Agriculture"), "BSA");
});

test("control codes use eight unambiguous characters", () => {
  assert.match(context.randomControlCode_(), /^[A-HJ-NP-Z2-9]{8}$/);
});

test("constant-time comparison accepts only matching values", () => {
  assert.equal(context.safeEqual_("abc123", "abc123"), true);
  assert.equal(context.safeEqual_("abc123", "abc124"), false);
  assert.equal(context.safeEqual_("short", "longer"), false);
});

test("text written to Sheets cannot be interpreted as a formula", () => {
  assert.equal(context.safeCellText_("=IMPORTXML(\"x\")"), "'=IMPORTXML(\"x\")");
  assert.equal(context.safeCellText_("General Assembly"), "General Assembly");
});
