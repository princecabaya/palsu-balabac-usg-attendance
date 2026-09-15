const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export async function parseHistoricalAttendanceFile(file) {
  if (!file) throw new Error("Choose the historical attendance Excel file first.");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Use the exported USG Attendance .xlsx file.");
  if (!window.ExcelJS) throw new Error("The Excel reader did not load. Refresh the page and try again.");
  const workbook = new window.ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return extractHistoricalAttendanceWorkbook(workbook, file.name);
}

export function extractHistoricalAttendanceWorkbook(workbook, sourceName = "USG Attendance file.xlsx") {
  const summarySheet = workbook.getWorksheet("Attendance Summary");
  const rosterSheet = workbook.getWorksheet("Final Students Name and QR");
  if (!summarySheet || !rosterSheet) {
    throw new Error("This workbook is missing the Attendance Summary or Final Students Name and QR sheet.");
  }

  const roster = readRoster(rosterSheet);
  const eventMetadata = readEventMetadata(summarySheet);
  const events = [];
  const corrections = [];
  const unresolved = [];
  let studentEventRows = 0;
  let completeSessions = 0;
  let openSessions = 0;

  for (const [eventNo, metadata] of eventMetadata) {
    const sheet = workbook.getWorksheet(`Event ${eventNo}`);
    if (!sheet) continue;
    const records = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const pairs = [[6, 7], [8, 9]];
      const hasAttendance = pairs.some(([timeInCol, timeOutCol]) => cellValue(row.getCell(timeInCol)) || cellValue(row.getCell(timeOutCol)));
      if (!hasAttendance) continue;
      studentEventRows += 1;
      const rawStudentNumber = normalizeStudentNumber(cellValue(row.getCell(3)));
      const studentName = text(cellValue(row.getCell(2)));
      const resolved = resolveHistoricalStudent(rawStudentNumber, studentName, roster);
      if (resolved.corrected) corrections.push({ eventNo, rowNumber, name: studentName, from: rawStudentNumber, to: resolved.studentNumber });
      if (!resolved.matched) unresolved.push({ eventNo, rowNumber, name: studentName, studentNumber: rawStudentNumber });

      pairs.forEach(([timeInCol, timeOutCol], index) => {
        const timeInValue = cellValue(row.getCell(timeInCol));
        const timeOutValue = cellValue(row.getCell(timeOutCol));
        if (!timeInValue && !timeOutValue) return;
        if (!timeInValue && timeOutValue) throw new Error(`Event ${eventNo}, row ${rowNumber} has a Time Out without a Time In.`);
        const timeIn = excelDateToPhilippineIso(timeInValue);
        const timeOut = timeOutValue ? excelDateToPhilippineIso(timeOutValue) : null;
        if (timeOut && new Date(timeOut) < new Date(timeIn)) throw new Error(`Event ${eventNo}, row ${rowNumber} has a Time Out earlier than its Time In.`);
        timeOut ? completeSessions += 1 : openSessions += 1;
        records.push({
          studentNumber: resolved.studentNumber || rawStudentNumber,
          timeIn,
          timeOut,
          sourceRow: rowNumber,
          slot: index + 1,
        });
      });
    }
    if (records.length) events.push({ ...metadata, records });
  }

  if (!events.length) throw new Error("No recorded Time In entries were found in the Event sheets.");
  return {
    sourceName: text(sourceName).slice(0, 120),
    events,
    corrections: uniqueCorrections(corrections),
    unresolved,
    stats: {
      eventCount: events.length,
      studentEventRows,
      sessionCount: events.reduce((total, event) => total + event.records.length, 0),
      completeSessions,
      openSessions,
    },
  };
}

export function resolveHistoricalStudent(rawStudentNumber, studentName, roster) {
  const studentNumber = normalizeStudentNumber(rawStudentNumber);
  if (roster.byId.has(studentNumber)) return { studentNumber, matched: true, corrected: false };
  const nameKey = normalizeName(studentName);
  const exact = roster.byName.get(nameKey) || [];
  if (exact.length === 1) return { studentNumber: exact[0].studentNumber, matched: true, corrected: exact[0].studentNumber !== studentNumber };

  const ranked = roster.entries
    .map((entry) => ({ entry, distance: levenshtein(nameKey, entry.nameKey) }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  const second = ranked[1];
  const tolerance = Math.max(1, Math.min(2, Math.floor(nameKey.length * 0.08)));
  if (nameKey.length >= 8 && best && best.distance <= tolerance && (!second || second.distance > best.distance)) {
    return { studentNumber: best.entry.studentNumber, matched: true, corrected: best.entry.studentNumber !== studentNumber };
  }
  return { studentNumber, matched: false, corrected: false };
}

function readRoster(sheet) {
  const entries = [];
  const byId = new Map();
  const byName = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const studentNumber = normalizeStudentNumber(cellValue(row.getCell(1)));
    if (!studentNumber) continue;
    const name = [cellValue(row.getCell(2)), cellValue(row.getCell(3)), cellValue(row.getCell(4))].filter(Boolean).join(" ");
    const entry = { studentNumber, nameKey: normalizeName(name) };
    entries.push(entry);
    byId.set(studentNumber, entry);
    const matching = byName.get(entry.nameKey) || [];
    matching.push(entry);
    byName.set(entry.nameKey, matching);
  }
  return { entries, byId, byName };
}

function readEventMetadata(sheet) {
  const result = new Map();
  for (let rowNumber = 9; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const sourceEventNo = Number(cellValue(row.getCell(1)));
    const name = text(cellValue(row.getCell(2)));
    if (!Number.isInteger(sourceEventNo) || !name) continue;
    const venue = text(cellValue(row.getCell(3)));
    const year = Number(cellValue(row.getCell(4)));
    const month = monthNumber(cellValue(row.getCell(5)));
    const day = Number(cellValue(row.getCell(6)));
    const timeParts = excelTimeParts(cellValue(row.getCell(7)));
    if (!year || !month || !day || !timeParts) throw new Error(`Attendance Summary row ${rowNumber} has incomplete event date or time information.`);
    result.set(sourceEventNo, {
      sourceEventNo,
      name,
      venue,
      startsAt: philippineIso(year, month, day, timeParts.hour, timeParts.minute, timeParts.second, 0),
    });
  }
  return result;
}

function cellValue(cell) {
  const value = cell?.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  if (value && typeof value === "object" && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  return value;
}

function excelDateToPhilippineIso(value) {
  const date = value instanceof Date ? value : typeof value === "number" ? new Date(Math.round((value - 25569) * 86400000)) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("The workbook contains an invalid attendance timestamp.");
  return philippineIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
}

function excelTimeParts(value) {
  if (value instanceof Date) return { hour: value.getUTCHours(), minute: value.getUTCMinutes(), second: value.getUTCSeconds() };
  if (typeof value === "number") {
    const seconds = Math.round((value % 1) * 86400);
    return { hour: Math.floor(seconds / 3600) % 24, minute: Math.floor((seconds % 3600) / 60), second: seconds % 60 };
  }
  const match = String(value || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match ? { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] || 0) } : null;
}

function philippineIso(year, month, day, hour, minute, second, millisecond) {
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millisecond, 3)}+08:00`;
}

function monthNumber(value) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  const index = MONTHS.indexOf(text(value).toLowerCase());
  return index >= 0 ? index + 1 : 0;
}

function normalizeStudentNumber(value) { return text(value).toUpperCase().replace(/\s+/g, ""); }
function normalizeName(value) { return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function text(value) { return String(value ?? "").trim().replace(/\s+/g, " "); }

function uniqueCorrections(corrections) {
  const seen = new Set();
  return corrections.filter((item) => {
    const key = `${item.eventNo}|${item.rowNumber}|${item.from}|${item.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}
