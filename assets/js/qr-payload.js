export const QR_PREFIX = "PSU-USG";
export const QR_VERSION = 1;

const PROGRAM_LABELS = Object.freeze({
  BEED: "Bachelor of Elementary Education",
  BSE: "Bachelor of Science in Entrepreneurship",
  BSA: "Bachelor of Science in Agriculture",
});

export function normalizeProgram(value = "") {
  const normalized = String(value).trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "BEED" || normalized.includes("ELEMENTARYEDUCATION")) return "BEEd";
  if (normalized === "BSE" || normalized.includes("ENTREPRENEUR")) return "BSE";
  if (normalized === "BSA" || normalized.includes("AGRICULTURE")) return "BSA";
  return String(value).trim();
}

export function programLabel(value = "") {
  return PROGRAM_LABELS[normalizeProgram(value).toUpperCase()] || String(value).trim();
}

export function normalizeStudentNumber(value = "") {
  return String(value).trim().toUpperCase().replace(/\s+/g, "");
}

export function buildQrPayload(student) {
  const studentNumber = normalizeStudentNumber(student.studentNumber);
  if (!studentNumber) throw new Error("Student number is required.");
  return JSON.stringify({
    a: QR_PREFIX,
    v: QR_VERSION,
    s: studentNumber,
  });
}

export function parseQrPayload(raw) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("The QR code is empty.");

  try {
    const decoded = JSON.parse(value);
    if (decoded.a !== QR_PREFIX || Number(decoded.v) !== QR_VERSION) {
      throw new Error("This QR code is not a PSU–USG attendance ID.");
    }
    const studentNumber = normalizeStudentNumber(decoded.s);
    if (!studentNumber) throw new Error("Student number is missing from the QR code.");
    return { studentNumber, version: QR_VERSION };
  } catch (error) {
    if (error instanceof SyntaxError) {
      const legacy = value.match(/^PSU-USG\|1\|(.+)$/i);
      if (legacy) return { studentNumber: normalizeStudentNumber(legacy[1]), version: 1 };
      throw new Error("This QR code is not a PSU–USG attendance ID.");
    }
    throw error;
  }
}

export function nextAttendanceAction(slots) {
  const labels = ["First Time In", "First Time Out", "Second Time In", "Second Time Out"];
  const index = Array.from({ length: 4 }, (_, i) => slots?.[i]).findIndex((value) => !value);
  return index === -1 ? null : { index, label: labels[index] };
}
