import { clearScannerSession, getApiUrl, getScannerSession, jsonp, makeRequestId, normalizeControlCode, scannerLogin } from "./api.js?v=20260905.1";
import { clearStatus, escapeHtml, formatDateTime, setStatus } from "./common.js?v=20260905.1";
import { parseQrPayload } from "./qr-payload.js";

const elements = {
  unlockPanel: document.querySelector("#unlock-panel"),
  unlockForm: document.querySelector("#unlock-form"),
  controlCode: document.querySelector("#control-code"),
  unlockStatus: document.querySelector("#unlock-status"),
  eventStrip: document.querySelector("#event-strip"),
  eventName: document.querySelector("#event-name"),
  eventVenue: document.querySelector("#event-venue"),
  connectionPill: document.querySelector("#connection-pill"),
  changeCode: document.querySelector("#change-code"),
  scanPanel: document.querySelector("#scan-panel"),
  attendanceModeHelp: document.querySelector("#attendance-mode-help"),
  attendanceModeButtons: [...document.querySelectorAll("[data-attendance-mode]")],
  startCamera: document.querySelector("#start-camera"),
  stopCamera: document.querySelector("#stop-camera"),
  qrFile: document.querySelector("#qr-file"),
  manualForm: document.querySelector("#manual-form"),
  studentNumber: document.querySelector("#student-number"),
  scanStatus: document.querySelector("#scan-status"),
  result: document.querySelector("#scan-result"),
  resultAction: document.querySelector("#result-action"),
  resultName: document.querySelector("#result-name"),
  resultNumber: document.querySelector("#result-number"),
  resultProgram: document.querySelector("#result-program"),
  resultTime: document.querySelector("#result-time"),
  report: document.querySelector("#attendance-report"),
  reportName: document.querySelector("#report-student-name"),
  reportMeta: document.querySelector("#report-student-meta"),
  reportCount: document.querySelector("#report-event-count"),
  reportBody: document.querySelector("#report-body"),
  reportEmpty: document.querySelector("#report-empty"),
  reportGenerated: document.querySelector("#report-generated-at"),
  printReport: document.querySelector("#print-report"),
  downloadReport: document.querySelector("#download-report"),
};

let session = getScannerSession();
let scanner = null;
let cameraRunning = false;
let processing = false;
let attendanceMode = "timeIn";
let historyRequestVersion = 0;
let resultDisplayVersion = 0;
let backendCapabilitiesPromise = null;
const recentSuccessfulScans = new Map();
const CLIENT_DUPLICATE_GAP_MS = 30 * 1000;
let currentReport = null;

elements.controlCode.addEventListener("input", () => {
  elements.controlCode.value = formatControlCode(elements.controlCode.value);
});

elements.attendanceModeButtons.forEach((button) => {
  button.addEventListener("click", () => setAttendanceMode(button.dataset.attendanceMode));
});

if (session) restoreSession(session);
else showLocked();

elements.unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus(elements.unlockStatus);
  if (!getApiUrl()) {
    setStatus(elements.unlockStatus, "This scanner link is missing the Google Sheet connection. Ask the organizer to copy the scanner link from the Control Dashboard.", "error");
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Checking…";
  try {
    const activeSession = await scannerLogin(elements.controlCode.value);
    await ensureBackendCapabilities();
    session = activeSession;
    elements.controlCode.value = "";
    unlockWithSession(session);
  } catch (error) {
    clearScannerSession();
    session = null;
    setStatus(elements.unlockStatus, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Unlock scanner";
  }
});

elements.changeCode.addEventListener("click", async () => {
  await stopCamera();
  clearScannerSession();
  session = null;
  showLocked();
  elements.controlCode.focus();
});

elements.startCamera.addEventListener("click", startCamera);
elements.stopCamera.addEventListener("click", stopCamera);
elements.printReport.addEventListener("click", printAttendanceReport);
elements.downloadReport.addEventListener("click", downloadAttendanceReport);

elements.qrFile.addEventListener("change", async () => {
  const file = elements.qrFile.files?.[0];
  if (!file) return;
  clearStatus(elements.scanStatus);
  try {
    if (!window.Html5Qrcode) throw new Error("The QR scanner library did not load. Check the internet connection and refresh the page.");
    if (!scanner) scanner = createQrScanner();
    if (cameraRunning) await stopCamera();
    const decoded = await scanner.scanFile(file, true);
    await handleDecodedText(decoded);
  } catch (error) {
    setStatus(elements.scanStatus, friendlyCameraError(error), "error");
  } finally {
    elements.qrFile.value = "";
  }
});

elements.manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await recordAttendance({ studentNumber: elements.studentNumber.value.trim().toUpperCase() });
  elements.studentNumber.select();
});

function showLocked() {
  elements.unlockPanel.hidden = false;
  elements.eventStrip.hidden = true;
  elements.scanPanel.hidden = true;
  elements.result.hidden = true;
  elements.report.hidden = true;
  currentReport = null;
  elements.connectionPill.classList.remove("is-live");
  elements.connectionPill.innerHTML = "<i></i> Locked";
}

async function restoreSession(activeSession) {
  showLocked();
  try {
    await ensureBackendCapabilities();
    if (session === activeSession) unlockWithSession(activeSession);
  } catch (error) {
    clearScannerSession();
    session = null;
    setStatus(elements.unlockStatus, error.message, "error");
  }
}

async function ensureBackendCapabilities() {
  if (!backendCapabilitiesPromise) {
    backendCapabilitiesPromise = jsonp("health", {}, 10000).then((health) => {
      if (health.apiVersion < 2 || !health.capabilities?.attendanceModes || !health.capabilities?.separateStudentHistory) {
        const error = new Error("The Google Sheet backend must be updated before scanning. Ask the organizer to replace Code.gs and redeploy the Apps Script web app.");
        error.code = "BACKEND_UPDATE_REQUIRED";
        throw error;
      }
      return health.capabilities;
    }).catch((error) => {
      backendCapabilitiesPromise = null;
      throw error;
    });
  }
  return backendCapabilitiesPromise;
}

function unlockWithSession(activeSession) {
  elements.unlockPanel.hidden = true;
  elements.eventStrip.hidden = false;
  elements.scanPanel.hidden = false;
  elements.eventName.textContent = activeSession.event.name;
  elements.eventVenue.textContent = activeSession.event.venue || "—";
  elements.connectionPill.classList.add("is-live");
  elements.connectionPill.innerHTML = "<i></i> Ready";
  clearStatus(elements.scanStatus);
}

async function startCamera() {
  clearStatus(elements.scanStatus);
  if (!window.isSecureContext) {
    setStatus(elements.scanStatus, "Camera access requires HTTPS. Open the published GitHub Pages link, not a downloaded HTML file.", "error");
    return;
  }
  if (!window.Html5Qrcode) {
    setStatus(elements.scanStatus, "The QR scanner library did not load. Check the internet connection and refresh the page.", "error");
    return;
  }
  elements.startCamera.disabled = true;
  elements.startCamera.textContent = "Opening camera…";
  try {
    await ensureBackendCapabilities();
    scanner = scanner || createQrScanner();
    await scanner.start(
      { facingMode: { ideal: "environment" } },
      {
        fps: 15,
        qrbox: (width, height) => {
          const size = Math.floor(Math.min(width, height) * 0.8);
          return { width: size, height: size };
        },
        disableFlip: true,
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: { ideal: "continuous" },
        },
      },
      handleDecodedText,
      () => {},
    );
    cameraRunning = true;
    elements.startCamera.hidden = true;
    elements.stopCamera.hidden = false;
  } catch (error) {
    setStatus(elements.scanStatus, friendlyCameraError(error), "error");
  } finally {
    elements.startCamera.disabled = false;
    elements.startCamera.textContent = "Start camera";
  }
}

function createQrScanner() {
  const config = {
    verbose: false,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  };
  if (window.Html5QrcodeSupportedFormats?.QR_CODE !== undefined) {
    config.formatsToSupport = [window.Html5QrcodeSupportedFormats.QR_CODE];
  }
  return new window.Html5Qrcode("qr-reader", config);
}

async function stopCamera() {
  if (!scanner || !cameraRunning) return;
  try { await scanner.stop(); } catch { /* Camera may already be stopped. */ }
  cameraRunning = false;
  elements.startCamera.hidden = false;
  elements.stopCamera.hidden = true;
}

async function handleDecodedText(rawValue) {
  if (processing) return;
  try {
    const parsed = parseQrPayload(rawValue);
    await recordAttendance({ studentNumber: parsed.studentNumber, qrPayload: rawValue });
  } catch (error) {
    setStatus(elements.scanStatus, error.message, "error");
  }
}

async function recordAttendance({ studentNumber, qrPayload = "" }) {
  if (!session || processing) return;
  const normalizedStudentNumber = String(studentNumber || "").trim().toUpperCase();
  const requestedMode = attendanceMode;
  const recentKey = `${normalizedStudentNumber}|${requestedMode}`;
  const recentTimestamp = recentSuccessfulScans.get(recentKey) || 0;
  if (Date.now() - recentTimestamp < CLIENT_DUPLICATE_GAP_MS) {
    setStatus(elements.scanStatus, `${modeLabel(requestedMode)} for ${normalizedStudentNumber} was just recorded. Duplicate scan ignored.${requestedMode === "timeIn" ? " Choose Time Out only when the student leaves." : ""}`, "info");
    return;
  }

  processing = true;
  setModeButtonsDisabled(true);
  setStatus(elements.scanStatus, `QR detected — recording ${modeLabel(requestedMode)}…`, "info");
  elements.result.hidden = true;
  elements.report.hidden = true;
  currentReport = null;
  const requestVersion = ++historyRequestVersion;
  try {
    const result = await jsonp("scan", {
      token: session.token,
      studentNumber: normalizedStudentNumber,
      qrPayload,
      mode: requestedMode,
      requestId: makeRequestId(),
    });
    if (!result.modeApplied || result.attendanceMode !== requestedMode) {
      throw new Error("The attendance server did not confirm the selected Time In/Time Out mode. Refresh the scanner and try again.");
    }
    recentSuccessfulScans.set(recentKey, Date.now());
    showResult(result);
    confirmationTone();
    setStatus(elements.scanStatus, `${result.attendanceAction} saved. Ready for the next student while attendance history loads.`, "success");
    loadAttendanceHistory(result.student, requestVersion);
  } catch (error) {
    if (error.code === "SESSION_EXPIRED" || error.code === "EVENT_ENDED") {
      clearScannerSession();
      session = null;
      showLocked();
      setStatus(elements.unlockStatus, error.message, "error");
    } else {
      setStatus(elements.scanStatus, error.message, "error");
    }
  } finally {
    processing = false;
    setModeButtonsDisabled(false);
  }
}

async function loadAttendanceHistory(student, requestVersion) {
  try {
    const result = await jsonp("studentHistory", {
      token: session?.token,
      studentNumber: student.studentNumber,
    });
    if (requestVersion !== historyRequestVersion) return;
    showAttendanceReport({ student: result.student || student, history: result.history });
    clearStatus(elements.scanStatus);
  } catch (error) {
    if (requestVersion !== historyRequestVersion) return;
    setStatus(elements.scanStatus, `Attendance was saved, but the history report could not be loaded: ${error.message}`, "info");
  }
}

function showAttendanceReport(result) {
  if (!Array.isArray(result.history)) {
    currentReport = null;
    elements.report.hidden = true;
    setStatus(elements.scanStatus, "Attendance was recorded, but student history requires the organizer to deploy the updated Apps Script backend.", "info");
    return;
  }
  const history = result.history;
  currentReport = {
    student: result.student,
    history,
    generatedAt: new Date().toISOString(),
  };

  elements.report.hidden = false;
  elements.reportName.textContent = result.student.name;
  elements.reportMeta.textContent = `${result.student.studentNumber} · ${result.student.program}`;
  elements.reportCount.textContent = String(history.length);
  elements.reportGenerated.textContent = formatDateTime(currentReport.generatedAt);
  elements.reportEmpty.hidden = history.length > 0;
  elements.reportBody.innerHTML = history.map((item) => `
    <tr>
      <td data-label="Event"><strong>${escapeHtml(item.eventName)}</strong><small>${escapeHtml(item.venue || "No venue")}</small></td>
      <td data-label="Date">${escapeHtml(formatReportDate(item.attendanceDate || item.eventDate))}</td>
      <td data-label="First in">${escapeHtml(formatReportTime(item.firstTimeIn))}</td>
      <td data-label="First out">${escapeHtml(formatReportTime(item.firstTimeOut))}</td>
      <td data-label="Second in">${escapeHtml(formatReportTime(item.secondTimeIn))}</td>
      <td data-label="Second out">${escapeHtml(formatReportTime(item.secondTimeOut))}</td>
      <td data-label="Total">${escapeHtml(item.totalTime || "—")}</td>
    </tr>
  `).join("");
}

function printAttendanceReport() {
  if (!currentReport) return;
  document.body.classList.add("printing-attendance-report");
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-attendance-report"), { once: true });
  window.print();
}

function downloadAttendanceReport() {
  if (!currentReport) return;
  const headings = ["Event", "Venue", "Attendance Date", "First Time In", "First Time Out", "Second Time In", "Second Time Out", "Total Time"];
  const rows = currentReport.history.map((item) => [
    item.eventName,
    item.venue,
    item.attendanceDate || item.eventDate,
    formatReportTime(item.firstTimeIn),
    formatReportTime(item.firstTimeOut),
    formatReportTime(item.secondTimeIn),
    formatReportTime(item.secondTimeOut),
    item.totalTime || "",
  ]);
  const preface = [
    ["Palawan State University – Balabac Campus"],
    ["USG Student Attendance Report"],
    ["Student", currentReport.student.name],
    ["Student Number", currentReport.student.studentNumber],
    ["Program", currentReport.student.program],
    ["Generated", formatDateTime(currentReport.generatedAt)],
    [],
  ];
  const csv = [...preface, headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `USG-Attendance-${safeFilename(currentReport.student.studentNumber)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatReportDate(value) {
  if (!value) return "—";
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })
    .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

function formatReportTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function csvCell(value = "") {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFilename(value) {
  return String(value || "student").replace(/[^A-Z0-9_-]/gi, "-");
}

function showResult(result) {
  const displayVersion = ++resultDisplayVersion;
  elements.result.hidden = false;
  elements.resultAction.textContent = result.attendanceAction;
  elements.resultName.textContent = result.student.name;
  elements.resultNumber.textContent = result.student.studentNumber;
  elements.resultProgram.textContent = result.student.program;
  elements.resultTime.textContent = formatDateTime(result.timestamp);
  window.setTimeout(() => {
    if (displayVersion === resultDisplayVersion) elements.result.hidden = true;
  }, 6500);
}

function confirmationTone() {
  if (navigator.vibrate) navigator.vibrate(90);
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1040, context.currentTime + 0.11);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  } catch { /* Sound is optional. */ }
}

function setAttendanceMode(mode) {
  if (mode !== "timeIn" && mode !== "timeOut") return;
  attendanceMode = mode;
  elements.attendanceModeButtons.forEach((button) => {
    const active = button.dataset.attendanceMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.attendanceModeHelp.textContent = `Active mode: ${modeLabel(mode)}`;
  clearStatus(elements.scanStatus);
}

function setModeButtonsDisabled(disabled) {
  elements.attendanceModeButtons.forEach((button) => { button.disabled = disabled; });
}

function modeLabel(mode) {
  return mode === "timeOut" ? "Time Out" : "Time In";
}

function formatControlCode(value) {
  const clean = normalizeControlCode(value).slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

function friendlyCameraError(error) {
  const message = String(error?.message || error || "");
  if (/permission|notallowed/i.test(message)) return "Camera permission was denied. Allow camera access in the browser, then try again.";
  if (/notfound|devices/i.test(message)) return "No camera was found. Use “Scan saved image” or enter the student number.";
  if (/scan image|qr code/i.test(message)) return "No readable PSU–USG QR code was found in that image.";
  return message || "The camera could not be started.";
}
