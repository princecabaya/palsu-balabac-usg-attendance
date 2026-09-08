import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const scannerPage = fs.readFileSync(new URL("../scanner.html", import.meta.url), "utf8");
const organizerScannerPage = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../assets/js/api.js", import.meta.url), "utf8");
const scannerSource = fs.readFileSync(new URL("../assets/js/scanner.js", import.meta.url), "utf8");
const backendSource = fs.readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");

test("scanner-only page does not expose organizer navigation", () => {
  assert.doesNotMatch(scannerPage, /href=["'][^"']*(?:generator|dashboard|reports)\.html/i);
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

test("both scanners provide explicit Time In and Time Out buttons", () => {
  for (const page of [scannerPage, organizerScannerPage]) {
    assert.match(page, /data-attendance-mode="timeIn"/);
    assert.match(page, /data-attendance-mode="timeOut"/);
  }
  assert.match(scannerSource, /mode:\s*requestedMode/);
  assert.match(backendSource, /BAD_ATTENDANCE_MODE/);
  assert.match(backendSource, /ALREADY_TIMED_IN/);
  assert.match(backendSource, /NOT_TIMED_IN/);
});

test("camera scanner is QR-only and attendance history loads separately", () => {
  assert.match(scannerSource, /formatsToSupport\s*=\s*\[window\.Html5QrcodeSupportedFormats\.QR_CODE\]/);
  assert.match(scannerSource, /fps:\s*15/);
  assert.match(scannerSource, /useBarCodeDetectorIfSupported:\s*true/);
  assert.match(scannerSource, /width:\s*\{\s*ideal:\s*1280\s*\}/);
  assert.match(scannerSource, /height:\s*\{\s*ideal:\s*720\s*\}/);
  assert.match(scannerSource, /focusMode:\s*\{\s*ideal:\s*"continuous"\s*\}/);
  assert.match(scannerSource, /QR detected — recording/);
  assert.match(scannerSource, /jsonp\("studentHistory"/);
  assert.match(backendSource, /case "studentHistory"/);
  const scanAction = backendSource.slice(backendSource.indexOf("function scanAction_"), backendSource.indexOf("function attendanceSlotForMode_"));
  assert.doesNotMatch(scanAction, /getStudentAttendanceHistory_/);
});

test("double-tap starts or refocuses the mobile scanner", () => {
  for (const page of [scannerPage, organizerScannerPage]) {
    assert.match(page, /Double-tap the camera/);
  }
  assert.match(scannerSource, /addEventListener\("pointerup", handlePreviewTap\)/);
  assert.match(scannerSource, /now - lastPreviewTapAt <= 450/);
  assert.match(scannerSource, /triggerScannerBoost/);
  assert.match(scannerSource, /focusMode: "single-shot"/);
  assert.match(scannerSource, /track\.applyConstraints/);
});
