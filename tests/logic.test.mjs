import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQrPayload,
  nextAttendanceAction,
  normalizeProgram,
  normalizeStudentNumber,
  parseQrPayload,
  programLabel,
} from "../assets/js/qr-payload.js";

test("builds and parses a PSU–USG QR payload", () => {
  const payload = buildQrPayload({ studentNumber: " 2026-10-0007bl " });
  assert.deepEqual(parseQrPayload(payload), { studentNumber: "2026-10-0007BL", version: 1 });
});

test("supports the documented legacy payload", () => {
  assert.deepEqual(parseQrPayload("PSU-USG|1|2026-10-0008BL"), { studentNumber: "2026-10-0008BL", version: 1 });
});

test("rejects unrelated QR content", () => {
  assert.throws(() => parseQrPayload("https://example.com"), /not a PSU–USG attendance ID/);
});

test("normalizes program codes and labels", () => {
  assert.equal(normalizeProgram("Bachelor of Elementary Education"), "BEEd");
  assert.equal(normalizeProgram("Bachelor of Science in Entrepreneurship"), "BSE");
  assert.equal(normalizeProgram("Bachelor of Science in Agriculture"), "BSA");
  assert.equal(programLabel("BSE"), "Bachelor of Science in Entrepreneurship");
});

test("normalizes student numbers", () => {
  assert.equal(normalizeStudentNumber(" 2026-10-0007 bl "), "2026-10-0007BL");
});

test("chooses the next attendance slot", () => {
  assert.deepEqual(nextAttendanceAction(["", "", "", ""]), { index: 0, label: "First Time In" });
  assert.deepEqual(nextAttendanceAction([1, 2, "", ""]), { index: 2, label: "Second Time In" });
  assert.equal(nextAttendanceAction([1, 2, 3, 4]), null);
});
