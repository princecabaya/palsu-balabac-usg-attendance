import { clearScannerSession, getApiUrl, getScannerSession, jsonp, makeRequestId, normalizeControlCode, scannerLogin } from "./api.js";
import { clearStatus, formatDateTime, setStatus } from "./common.js";
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
};

let session = getScannerSession();
let scanner = null;
let cameraRunning = false;
let processing = false;
let lastValue = "";
let lastHandledAt = 0;

elements.controlCode.addEventListener("input", () => {
  elements.controlCode.value = formatControlCode(elements.controlCode.value);
});

if (session) unlockWithSession(session);
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
    session = await scannerLogin(elements.controlCode.value);
    unlockWithSession(session);
  } catch (error) {
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

elements.qrFile.addEventListener("change", async () => {
  const file = elements.qrFile.files?.[0];
  if (!file) return;
  clearStatus(elements.scanStatus);
  try {
    if (!window.Html5Qrcode) throw new Error("The QR scanner library did not load. Check the internet connection and refresh the page.");
    if (!scanner) scanner = new Html5Qrcode("qr-reader", { verbose: false });
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
  elements.connectionPill.classList.remove("is-live");
  elements.connectionPill.innerHTML = "<i></i> Locked";
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
    scanner = scanner || new Html5Qrcode("qr-reader", { verbose: false });
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: (width, height) => ({ width: Math.min(width, height) * 0.72, height: Math.min(width, height) * 0.72 }), aspectRatio: 1 },
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

async function stopCamera() {
  if (!scanner || !cameraRunning) return;
  try { await scanner.stop(); } catch { /* Camera may already be stopped. */ }
  cameraRunning = false;
  elements.startCamera.hidden = false;
  elements.stopCamera.hidden = true;
}

async function handleDecodedText(rawValue) {
  const now = Date.now();
  if (processing || (rawValue === lastValue && now - lastHandledAt < 4000)) return;
  lastValue = rawValue;
  lastHandledAt = now;
  try {
    const parsed = parseQrPayload(rawValue);
    await recordAttendance({ studentNumber: parsed.studentNumber, qrPayload: rawValue });
  } catch (error) {
    setStatus(elements.scanStatus, error.message, "error");
  }
}

async function recordAttendance({ studentNumber, qrPayload = "" }) {
  if (!session) return;
  processing = true;
  clearStatus(elements.scanStatus);
  elements.result.hidden = true;
  try {
    const result = await jsonp("scan", {
      token: session.token,
      studentNumber,
      qrPayload,
      requestId: makeRequestId(),
    });
    showResult(result);
    confirmationTone();
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
  }
}

function showResult(result) {
  elements.result.hidden = false;
  elements.resultAction.textContent = result.attendanceAction;
  elements.resultName.textContent = result.student.name;
  elements.resultNumber.textContent = result.student.studentNumber;
  elements.resultProgram.textContent = result.student.program;
  elements.resultTime.textContent = formatDateTime(result.timestamp);
  window.setTimeout(() => { elements.result.hidden = true; }, 6500);
}

function confirmationTone() {
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
