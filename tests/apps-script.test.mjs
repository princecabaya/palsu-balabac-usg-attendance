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

test("attendance duration totals only completed time-in/time-out pairs", () => {
  const scans = [
    new Date("2026-09-05T00:00:00Z"),
    new Date("2026-09-05T01:30:00Z"),
    new Date("2026-09-05T04:00:00Z"),
    new Date("2026-09-05T04:45:00Z"),
  ];
  assert.equal(context.attendanceDurationSeconds_(scans), 8100);
  assert.equal(context.formatDurationSeconds_(8100), "02:15:00");
  assert.equal(context.attendanceDurationSeconds_([scans[0], "", scans[2], ""]), 0);
  assert.equal(context.formatDurationSeconds_(0), "");
});

test("explicit Time In selects only a valid time-in slot", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.attendanceSlotForMode_(["", "", "", ""], "timeIn"))),
    { index: 0, label: "First Time In" },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.attendanceSlotForMode_([new Date(), new Date(), "", ""], "timeIn"))),
    { index: 2, label: "Second Time In" },
  );
  assert.throws(
    () => context.attendanceSlotForMode_([new Date(), "", "", ""], "timeIn"),
    (error) => error.code === "ALREADY_TIMED_IN",
  );
});

test("explicit Time Out requires an unmatched time-in slot", () => {
  assert.throws(
    () => context.attendanceSlotForMode_(["", "", "", ""], "timeOut"),
    (error) => error.code === "NOT_TIMED_IN",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.attendanceSlotForMode_([new Date(), "", "", ""], "timeOut"))),
    { index: 1, label: "First Time Out" },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.attendanceSlotForMode_([new Date(), new Date(), new Date(), ""], "timeOut"))),
    { index: 3, label: "Second Time Out" },
  );
});

test("completed attendance and missing mode cannot create duplicate entries", () => {
  const complete = [new Date(), new Date(), new Date(), new Date()];
  assert.throws(
    () => context.attendanceSlotForMode_(complete, "timeIn"),
    (error) => error.code === "ATTENDANCE_COMPLETE",
  );
  assert.throws(
    () => context.attendanceSlotForMode_(["", "", "", ""], ""),
    (error) => error.code === "BAD_ATTENDANCE_MODE",
  );
});
