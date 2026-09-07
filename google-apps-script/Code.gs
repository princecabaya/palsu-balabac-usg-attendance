/**
 * PSU Balabac USG QR Attendance API
 * Paste this file into Extensions > Apps Script from the USG Attendance Sheet.
 * Deploy as a Web app: Execute as Me; access Anyone (or your Workspace domain).
 */

const APP_NAME = "PSU Balabac USG Attendance";
const TIME_ZONE = "Asia/Manila";
const STUDENTS_SHEET = "Students Name and QR Code";
const SUMMARY_SHEET = "Attendance Summary";
const CONTROL_SHEET = "_USG_Control";
const STUDENT_FIRST_ROW = 12;
const SUMMARY_FIRST_EVENT_ROW = 9;
const ADMIN_SESSION_SECONDS = 60 * 60;
const SCANNER_SESSION_SECONDS = 6 * 60 * 60;
const MIN_SCAN_GAP_SECONDS = 30;
const API_VERSION = 2;
const CONTROL_HEADERS = [
  "Event No.", "Event Name", "Venue", "Event Date", "Start Time",
  "Expires At (ms)", "Event Sheet", "Code Hash", "Code Version",
  "Status", "Created At (ms)", "Updated At (ms)"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("USG Attendance")
    .addItem("Initialize / Change Admin Password", "initializeUSGAttendance")
    .addItem("Repair Control Sheet", "repairUSGControlSheet")
    .addToUi();
}

function initializeUSGAttendance() {
  const html = HtmlService.createHtmlOutput([
    '<!doctype html><html><head><base target="_top"><style>',
    'body{font:14px system-ui,sans-serif;color:#183044;padding:18px}h2{margin:0 0 8px}p{color:#627181;line-height:1.45}',
    'input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #bdc9d1;border-radius:9px;font:inherit}',
    'button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:9px;background:#f47a31;color:white;font-weight:800;cursor:pointer}',
    '#message{min-height:20px;margin-top:10px;color:#b73535;font-size:12px}</style></head><body>',
    '<h2>USG Attendance Setup</h2><p>Create an administrator password with at least 10 characters. It opens the Control Dashboard and ID Generator.</p>',
    '<input id="password" type="password" autocomplete="new-password" minlength="10" placeholder="Administrator password">',
    '<button id="save" onclick="savePassword()">Initialize attendance</button><div id="message" role="status"></div>',
    '<script>function savePassword(){const p=document.getElementById("password").value;const b=document.getElementById("save");const m=document.getElementById("message");',
    'if(p.length<10){m.textContent="Use at least 10 characters.";return}b.disabled=true;b.textContent="Saving…";m.textContent="";',
    'google.script.run.withSuccessHandler(function(message){m.style.color="#27603b";m.textContent=message;setTimeout(function(){google.script.host.close()},900)})',
    '.withFailureHandler(function(error){b.disabled=false;b.textContent="Initialize attendance";m.textContent=error.message||"Setup failed."})',
    '.completeUSGSetup(p)}</script></body></html>'
  ].join(""))
    .setWidth(390)
    .setHeight(310);
  SpreadsheetApp.getUi().showModalDialog(html, "USG Attendance Setup");
}

function completeUSGSetup(password) {
  if (!password || password.length < 10) {
    throw new Error("Use a password with at least 10 characters.");
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet.getSheetByName(STUDENTS_SHEET) || !spreadsheet.getSheetByName(SUMMARY_SHEET)) {
    throw new Error("The required tabs were not found. Keep the names “Students Name and QR Code” and “Attendance Summary”.");
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty("SPREADSHEET_ID", spreadsheet.getId());
  properties.setProperty("ADMIN_PASSWORD_HASH", hash_(password));
  properties.setProperty("ADMIN_VERSION", randomToken_());
  ensureControlSheet_();
  return "USG Attendance is initialized. You may now deploy this Apps Script project as a Web app.";
}

function repairUSGControlSheet() {
  ensureConfigured_();
  ensureControlSheet_();
  SpreadsheetApp.getUi().alert("The protected control sheet is ready.");
}

function doGet(e) {
  const parameters = (e && e.parameter) || {};
  const callback = validCallback_(parameters.callback);
  try {
    const action = String(parameters.action || "health");
    let result;
    switch (action) {
      case "health": result = health_(); break;
      case "challenge": result = challenge_(parameters); break;
      case "adminLogin": result = adminLogin_(parameters); break;
      case "controlLogin": result = controlLogin_(parameters); break;
      case "students": result = studentsAction_(parameters); break;
      case "listEvents": result = listEventsAction_(parameters); break;
      case "createEvent": result = createEventAction_(parameters); break;
      case "rotateCode": result = rotateCodeAction_(parameters); break;
      case "endEvent": result = endEventAction_(parameters); break;
      case "scan": result = scanAction_(parameters); break;
      case "studentHistory": result = studentHistoryAction_(parameters); break;
      default: throw apiError_("UNKNOWN_ACTION", "Unknown attendance action.");
    }
    return jsonp_(callback, Object.assign({ ok: true }, result || {}));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonp_(callback, {
      ok: false,
      code: error.code || "SERVER_ERROR",
      message: error.expose ? error.message : "The attendance server could not complete the request. Please try again."
    });
  }
}

function health_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    app: APP_NAME,
    apiVersion: API_VERSION,
    capabilities: {
      attendanceModes: true,
      separateStudentHistory: true
    },
    configured: Boolean(properties.getProperty("SPREADSHEET_ID") && properties.getProperty("ADMIN_PASSWORD_HASH")),
    serverTime: new Date().toISOString()
  };
}

function challenge_(parameters) {
  const scope = String(parameters.scope || "");
  if (scope !== "admin" && scope !== "scanner") throw apiError_("BAD_SCOPE", "Choose an administrator or scanner sign-in.");
  const nonce = randomToken_();
  CacheService.getScriptCache().put("challenge:" + nonce, scope, 120);
  return { nonce: nonce, expiresIn: 120 };
}

function adminLogin_(parameters) {
  ensureConfigured_();
  consumeChallenge_(parameters.nonce, "admin");
  const storedHash = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD_HASH");
  const expected = hash_(storedHash + ":" + parameters.nonce);
  if (!safeEqual_(expected, parameters.proof)) throw apiError_("INVALID_LOGIN", "The administrator password is incorrect.");

  const now = Date.now();
  const expiresAt = now + ADMIN_SESSION_SECONDS * 1000;
  const token = randomToken_();
  const adminVersion = PropertiesService.getScriptProperties().getProperty("ADMIN_VERSION") || "legacy";
  CacheService.getScriptCache().put("adminSession:" + token, JSON.stringify({ expiresAt: expiresAt, adminVersion: adminVersion }), ADMIN_SESSION_SECONDS);
  return { token: token, expiresAt: new Date(expiresAt).toISOString() };
}

function controlLogin_(parameters) {
  ensureConfigured_();
  consumeChallenge_(parameters.nonce, "scanner");
  const records = getControlRecords_();
  const now = Date.now();
  let matching = null;

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record.status !== "ACTIVE" || record.expiresAtMs <= now) continue;
    const expected = hash_(record.codeHash + ":" + parameters.nonce);
    if (safeEqual_(expected, parameters.proof)) {
      matching = record;
      break;
    }
  }
  if (!matching) throw apiError_("INVALID_CONTROL_CODE", "The control code is invalid, expired, or the event has ended.");

  const expiresAt = Math.min(now + SCANNER_SESSION_SECONDS * 1000, matching.expiresAtMs);
  const token = randomToken_();
  const session = {
    eventNo: matching.eventNo,
    sheetName: matching.sheetName,
    codeVersion: matching.codeVersion,
    expiresAt: expiresAt
  };
  const ttl = Math.max(1, Math.floor((expiresAt - now) / 1000));
  CacheService.getScriptCache().put("scannerSession:" + token, JSON.stringify(session), Math.min(ttl, SCANNER_SESSION_SECONDS));
  return {
    token: token,
    expiresAt: new Date(expiresAt).toISOString(),
    event: publicEvent_(matching)
  };
}

function studentsAction_(parameters) {
  requireAdmin_(parameters.token);
  return { students: getStudents_().map(function(student) {
    return {
      name: student.displayName,
      studentNumber: student.studentNumber,
      program: student.program
    };
  }) };
}

function listEventsAction_(parameters) {
  requireAdmin_(parameters.token);
  const records = getControlRecords_().sort(function(a, b) { return b.eventNo - a.eventNo; });
  return { events: records.map(function(record) {
    return Object.assign(publicEvent_(record), { counts: getSummaryCounts_(record.eventNo) });
  }) };
}

function createEventAction_(parameters) {
  requireAdmin_(parameters.token);
  const name = requiredText_(parameters.name, "Event name", 100);
  const venue = requiredText_(parameters.venue, "Venue", 100);
  const eventDate = validDateText_(parameters.eventDate);
  const startTime = validTimeText_(parameters.startTime);
  const expiresAtMs = parseLocalDateTime_(parameters.expiresAt);
  if (expiresAtMs <= Date.now()) throw apiError_("BAD_EXPIRY", "The control-code expiry must be in the future.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const eventNo = nextAvailableEventNo_();
    const sheetName = "Event " + eventNo;
    const students = getStudents_();
    if (!students.length) throw apiError_("EMPTY_ROSTER", "No students were found in the roster sheet.");
    prepareEventSheet_(sheetName, students);

    const controlCode = randomControlCode_();
    const now = Date.now();
    const record = {
      eventNo: eventNo,
      name: name,
      venue: venue,
      eventDate: eventDate,
      startTime: startTime,
      expiresAtMs: expiresAtMs,
      sheetName: sheetName,
      codeHash: hash_(controlCode),
      codeVersion: randomToken_(),
      status: "ACTIVE",
      createdAtMs: now,
      updatedAtMs: now
    };
    appendControlRecord_(record);
    writeSummaryEvent_(record);
    SpreadsheetApp.flush();
    return {
      event: publicEvent_(record),
      controlCode: controlCode,
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function rotateCodeAction_(parameters) {
  requireAdmin_(parameters.token);
  const eventNo = Number(parameters.eventNo);
  const controlCode = randomControlCode_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const record = getControlRecord_(eventNo);
    if (!record) throw apiError_("EVENT_NOT_FOUND", "The event was not found.");
    if (record.status !== "ACTIVE") throw apiError_("EVENT_ENDED", "This event has already ended.");
    record.codeHash = hash_(controlCode);
    record.codeVersion = randomToken_();
    record.updatedAtMs = Date.now();
    writeControlRecord_(record);
    return {
      event: publicEvent_(record),
      controlCode: controlCode,
      expiresAt: new Date(record.expiresAtMs).toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function endEventAction_(parameters) {
  requireAdmin_(parameters.token);
  const eventNo = Number(parameters.eventNo);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const record = getControlRecord_(eventNo);
    if (!record) throw apiError_("EVENT_NOT_FOUND", "The event was not found.");
    record.status = "ENDED";
    record.codeVersion = randomToken_();
    record.updatedAtMs = Date.now();
    writeControlRecord_(record);
    updateSummaryCounts_(record);
    return { event: publicEvent_(record) };
  } finally {
    lock.releaseLock();
  }
}

function scanAction_(parameters) {
  const session = requireScannerSession_(parameters.token);
  const attendanceMode = String(parameters.mode || "");
  if (attendanceMode !== "timeIn" && attendanceMode !== "timeOut") {
    throw apiError_("BAD_ATTENDANCE_MODE", "Choose Time In or Time Out before scanning.");
  }
  const requestId = String(parameters.requestId || "").slice(0, 100);
  const requestCacheKey = requestId ? "scanRequest:" + requestId : "";
  const cache = CacheService.getScriptCache();
  if (requestCacheKey) {
    const previous = cache.get(requestCacheKey);
    if (previous) return JSON.parse(previous);
  }

  let studentNumber = normalizeStudentNumber_(parameters.studentNumber || "");
  if (!studentNumber && parameters.qrPayload) studentNumber = studentNumberFromQr_(parameters.qrPayload);
  if (!studentNumber) throw apiError_("BAD_QR", "The QR code does not contain a student number.");

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const record = getControlRecord_(session.eventNo);
    if (!record || record.status !== "ACTIVE") throw apiError_("EVENT_ENDED", "This event is no longer accepting attendance.");
    if (record.expiresAtMs <= Date.now()) throw apiError_("SESSION_EXPIRED", "The event control code has expired. Ask the organizer for a new code.");
    if (record.codeVersion !== session.codeVersion) throw apiError_("SESSION_EXPIRED", "The organizer issued a new control code. Unlock the scanner again.");

    const students = getStudents_();
    const student = students.find(function(item) { return item.studentNumber === studentNumber; });
    if (!student) throw apiError_("STUDENT_NOT_FOUND", "This student number is not in the USG Attendance roster.");

    const sheet = getSpreadsheet_().getSheetByName(record.sheetName);
    if (!sheet) throw apiError_("EVENT_SHEET_MISSING", "The event attendance sheet is missing.");
    const row = findStudentRow_(sheet, studentNumber);
    if (!row) throw apiError_("STUDENT_NOT_FOUND", "This student is not listed on the event attendance sheet.");

    const slots = sheet.getRange(row, 6, 1, 4).getValues()[0];
    const nextSlot = attendanceSlotForMode_(slots, attendanceMode);
    const filledTimes = slots.filter(function(value) { return value instanceof Date; });
    if (filledTimes.length) {
      const lastTime = filledTimes[filledTimes.length - 1];
      if ((Date.now() - lastTime.getTime()) / 1000 < MIN_SCAN_GAP_SECONDS) {
        throw apiError_("TOO_SOON", "This QR was just recorded. Wait at least 30 seconds before the next time in or time out.");
      }
    }

    const now = new Date();
    if (!sheet.getRange(row, 5).getValue()) sheet.getRange(row, 5).setValue(now).setNumberFormat("yyyy-mm-dd");
    sheet.getRange(row, 6 + nextSlot.index).setValue(now).setNumberFormat("hh:mm:ss AM/PM");
    if (nextSlot.index === 0) updateSummaryCounts_(record);
    SpreadsheetApp.flush();

    const response = {
      attendanceAction: nextSlot.label,
      attendanceMode: attendanceMode,
      modeApplied: true,
      timestamp: now.toISOString(),
      student: {
        name: student.displayName,
        studentNumber: student.studentNumber,
        program: student.program
      },
      event: publicEvent_(record)
    };
    if (requestCacheKey) cache.put(requestCacheKey, JSON.stringify(response), 300);
    return response;
  } finally {
    lock.releaseLock();
  }
}

function attendanceSlotForMode_(slots, attendanceMode) {
  const values = slots || [];
  const filled = values.map(function(value) { return value !== "" && value !== null && value !== undefined; });

  if (attendanceMode === "timeIn") {
    if (!filled[0]) return { index: 0, label: "First Time In" };
    if (!filled[1]) throw apiError_("ALREADY_TIMED_IN", "This student is already timed in. Choose Time Out before scanning again.");
    if (!filled[2]) return { index: 2, label: "Second Time In" };
    if (!filled[3]) throw apiError_("ALREADY_TIMED_IN", "This student is already timed in. Choose Time Out before scanning again.");
    throw apiError_("ATTENDANCE_COMPLETE", "All attendance entries for this student are already complete.");
  }

  if (attendanceMode === "timeOut") {
    if (!filled[0]) throw apiError_("NOT_TIMED_IN", "This student has no open Time In. Choose Time In first.");
    if (!filled[1]) return { index: 1, label: "First Time Out" };
    if (!filled[2]) throw apiError_("NOT_TIMED_IN", "This student has no open Time In. Choose Time In first.");
    if (!filled[3]) return { index: 3, label: "Second Time Out" };
    throw apiError_("ATTENDANCE_COMPLETE", "All attendance entries for this student are already complete.");
  }

  throw apiError_("BAD_ATTENDANCE_MODE", "Choose Time In or Time Out before scanning.");
}

function studentHistoryAction_(parameters) {
  requireScannerSession_(parameters.token);
  const studentNumber = normalizeStudentNumber_(parameters.studentNumber || "");
  if (!studentNumber) throw apiError_("MISSING_STUDENT_NUMBER", "Enter a student number.");
  const student = getStudents_().find(function(item) { return item.studentNumber === studentNumber; });
  if (!student) throw apiError_("STUDENT_NOT_FOUND", "This student number is not in the USG Attendance roster.");
  return {
    student: {
      name: student.displayName,
      studentNumber: student.studentNumber,
      program: student.program
    },
    history: getStudentAttendanceHistory_(student.studentNumber)
  };
}

function getStudentAttendanceHistory_(studentNumber) {
  const spreadsheet = getSpreadsheet_();
  const records = getControlRecords_().sort(function(a, b) {
    if (a.eventDate === b.eventDate) return b.eventNo - a.eventNo;
    return String(a.eventDate).localeCompare(String(b.eventDate)) * -1;
  });

  return records.reduce(function(history, record) {
    const sheet = spreadsheet.getSheetByName(record.sheetName);
    if (!sheet) return history;
    const row = findStudentRow_(sheet, studentNumber);
    if (!row) return history;

    const values = sheet.getRange(row, 5, 1, 5).getValues()[0];
    const scans = values.slice(1, 5);
    if (!scans.some(function(value) { return value instanceof Date; })) return history;
    const totalSeconds = attendanceDurationSeconds_(scans);

    history.push({
      eventNo: record.eventNo,
      eventName: record.name,
      venue: record.venue,
      eventDate: record.eventDate,
      attendanceDate: values[0] instanceof Date ? Utilities.formatDate(values[0], TIME_ZONE, "yyyy-MM-dd") : record.eventDate,
      firstTimeIn: dateToIso_(scans[0]),
      firstTimeOut: dateToIso_(scans[1]),
      secondTimeIn: dateToIso_(scans[2]),
      secondTimeOut: dateToIso_(scans[3]),
      totalSeconds: totalSeconds,
      totalTime: formatDurationSeconds_(totalSeconds),
      status: record.status
    });
    return history;
  }, []);
}

function dateToIso_(value) {
  return value instanceof Date ? value.toISOString() : "";
}

function attendanceDurationSeconds_(scans) {
  const values = scans || [];
  let milliseconds = 0;
  if (values[0] instanceof Date && values[1] instanceof Date && values[1] >= values[0]) {
    milliseconds += values[1].getTime() - values[0].getTime();
  }
  if (values[2] instanceof Date && values[3] instanceof Date && values[3] >= values[2]) {
    milliseconds += values[3].getTime() - values[2].getTime();
  }
  return Math.floor(milliseconds / 1000);
}

function formatDurationSeconds_(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (!total) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = Math.floor(total % 60);
  return [hours, minutes, remaining].map(function(value) { return String(value).padStart(2, "0"); }).join(":");
}

function getStudents_() {
  const sheet = getSpreadsheet_().getSheetByName(STUDENTS_SHEET);
  if (!sheet) throw apiError_("ROSTER_MISSING", "The student roster sheet was not found.");
  const lastRow = sheet.getLastRow();
  if (lastRow < STUDENT_FIRST_ROW) return [];
  const values = sheet.getRange(STUDENT_FIRST_ROW, 1, lastRow - STUDENT_FIRST_ROW + 1, 6).getDisplayValues();
  const seen = {};
  return values.reduce(function(students, row) {
    const studentNumber = normalizeStudentNumber_(row[5]);
    if (!studentNumber || seen[studentNumber]) return students;
    seen[studentNumber] = true;
    const lastName = cleanText_(row[1]);
    const firstName = cleanText_(row[2]);
    const middle = cleanText_(row[3]);
    const program = normalizeProgram_(row[4]);
    const displayName = [firstName, middle, lastName].filter(Boolean).join(" ").replace(/\s+/g, " ");
    const sheetName = (lastName ? lastName + ", " : "") + [firstName, middle].filter(Boolean).join(" ");
    students.push({
      displayName: displayName || studentNumber,
      sheetName: sheetName || displayName || studentNumber,
      studentNumber: studentNumber,
      program: program
    });
    return students;
  }, []);
}

function prepareEventSheet_(sheetName, students) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  const requiredRows = students.length + 1;
  if (sheet.getMaxRows() < requiredRows) sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  sheet.getRange(1, 1, sheet.getMaxRows(), 10).clearContent();
  sheet.getRange(1, 1, 1, 10).setValues([["No.", "Name of the Student", "QR Code", "", "Date", "Time In", "Time Out", "Time In", "Time Out", "Total Time"]]);

  const rows = students.map(function(student, index) {
    return [index + 1, safeCellText_(student.sheetName), student.studentNumber, "", "", "", "", "", ""];
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
    const formulas = rows.map(function() {
      return ['=IF(AND(RC[-4]<>"",RC[-3]<>""),RC[-3]-RC[-4],0)+IF(AND(RC[-2]<>"",RC[-1]<>""),RC[-1]-RC[-2],0)'];
    });
    sheet.getRange(2, 10, rows.length, 1).setFormulasR1C1(formulas).setNumberFormat("[h]:mm:ss");
    sheet.getRange(2, 3, rows.length, 1).setNumberFormat("@");
    sheet.getRange(2, 5, rows.length, 1).setNumberFormat("yyyy-mm-dd");
    sheet.getRange(2, 6, rows.length, 4).setNumberFormat("hh:mm:ss AM/PM");
  }
  sheet.getRange(1, 1, 1, 10).setBackground("#FFD2B5").setFontWeight("bold").setBorder(true, true, true, true, true, true);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 55);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 20);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidths(6, 4, 115);
  sheet.setColumnWidth(10, 105);
}

function writeSummaryEvent_(record) {
  const sheet = getSpreadsheet_().getSheetByName(SUMMARY_SHEET);
  if (!sheet) throw apiError_("SUMMARY_MISSING", "The Attendance Summary sheet was not found.");
  const row = SUMMARY_FIRST_EVENT_ROW + record.eventNo - 1;
  ensureSheetRows_(sheet, row);
  const parts = record.eventDate.split("-");
  const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(parts[1]) - 1];
  sheet.getRange(row, 1, 1, 7).setValues([[
    record.eventNo, safeCellText_(record.name), safeCellText_(record.venue), Number(parts[0]), monthName, Number(parts[2]), record.startTime
  ]]);
  const eventSheet = getSpreadsheet_().getSheetByName(record.sheetName);
  sheet.getRange(row, 8).setFormula('=HYPERLINK("#gid=' + eventSheet.getSheetId() + '","Click here")');
  sheet.getRange(row, 9, 1, 4).setValues([[0, 0, 0, 0]]);
}

function updateSummaryCounts_(record) {
  const eventSheet = getSpreadsheet_().getSheetByName(record.sheetName);
  if (!eventSheet) return;
  const lastRow = eventSheet.getLastRow();
  const attended = {};
  if (lastRow >= 2) {
    const values = eventSheet.getRange(2, 3, lastRow - 1, 6).getValues();
    values.forEach(function(row) {
      const studentNumber = normalizeStudentNumber_(row[0]);
      const firstIn = row[3];
      const secondIn = row[5];
      if (studentNumber && (firstIn instanceof Date || secondIn instanceof Date)) attended[studentNumber] = true;
    });
  }
  const programByStudent = {};
  getStudents_().forEach(function(student) { programByStudent[student.studentNumber] = student.program; });
  const counts = { BEEd: 0, BSE: 0, BSA: 0 };
  Object.keys(attended).forEach(function(studentNumber) {
    const program = programByStudent[studentNumber];
    if (Object.prototype.hasOwnProperty.call(counts, program)) counts[program] += 1;
  });
  const total = counts.BEEd + counts.BSE + counts.BSA;
  const summary = getSpreadsheet_().getSheetByName(SUMMARY_SHEET);
  const row = SUMMARY_FIRST_EVENT_ROW + record.eventNo - 1;
  ensureSheetRows_(summary, row);
  summary.getRange(row, 9, 1, 4).setValues([[counts.BEEd, counts.BSE, counts.BSA, total]]);
}

function getSummaryCounts_(eventNo) {
  const summary = getSpreadsheet_().getSheetByName(SUMMARY_SHEET);
  const row = SUMMARY_FIRST_EVENT_ROW + Number(eventNo) - 1;
  if (!summary || row > summary.getMaxRows()) return { BEEd: 0, BSE: 0, BSA: 0, total: 0 };
  const values = summary.getRange(row, 9, 1, 4).getValues()[0].map(function(value) { return Number(value) || 0; });
  return { BEEd: values[0], BSE: values[1], BSA: values[2], total: values[3] };
}

function nextAvailableEventNo_() {
  const records = getControlRecords_();
  const used = {};
  records.forEach(function(record) { used[record.eventNo] = true; });
  const summary = getSpreadsheet_().getSheetByName(SUMMARY_SHEET);
  for (let eventNo = 1; eventNo <= 999; eventNo += 1) {
    if (used[eventNo]) continue;
    const summaryRow = SUMMARY_FIRST_EVENT_ROW + eventNo - 1;
    const summaryUsed = summaryRow <= summary.getMaxRows() && summary.getRange(summaryRow, 1).getDisplayValue().trim() !== "";
    if (summaryUsed) continue;
    const eventSheet = getSpreadsheet_().getSheetByName("Event " + eventNo);
    if (eventSheet && hasAttendanceData_(eventSheet)) continue;
    return eventNo;
  }
  throw apiError_("EVENT_LIMIT", "No available event number was found.");
}

function hasAttendanceData_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 5, lastRow - 1, 5).getDisplayValues();
  return values.some(function(row) { return row.some(function(value) { return value !== ""; }); });
}

function findStudentRow_(sheet, studentNumber) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const match = sheet.getRange(2, 3, lastRow - 1, 1)
    .createTextFinder(studentNumber)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();
  return match ? match.getRow() : 0;
}

function ensureControlSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONTROL_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(CONTROL_SHEET);
  const current = sheet.getRange(1, 1, 1, CONTROL_HEADERS.length).getDisplayValues()[0];
  if (current.join("|") !== CONTROL_HEADERS.join("|")) {
    sheet.getRange(1, 1, 1, CONTROL_HEADERS.length).setValues([CONTROL_HEADERS]);
  }
  sheet.getRange(1, 1, 1, CONTROL_HEADERS.length).setBackground("#183044").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function appendControlRecord_(record) {
  const sheet = ensureControlSheet_();
  sheet.appendRow(recordToRow_(record));
}

function writeControlRecord_(record) {
  const sheet = ensureControlSheet_();
  sheet.getRange(record.controlRow, 1, 1, CONTROL_HEADERS.length).setValues([recordToRow_(record)]);
}

function recordToRow_(record) {
  return [
    record.eventNo, safeCellText_(record.name), safeCellText_(record.venue), record.eventDate, record.startTime,
    record.expiresAtMs, record.sheetName, record.codeHash, record.codeVersion,
    record.status, record.createdAtMs, record.updatedAtMs
  ];
}

function getControlRecords_() {
  const sheet = ensureControlSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, CONTROL_HEADERS.length).getValues()
    .map(function(row, index) { return rowToRecord_(row, index + 2); })
    .filter(function(record) { return record.eventNo > 0; });
}

function getControlRecord_(eventNo) {
  return getControlRecords_().find(function(record) { return record.eventNo === Number(eventNo); }) || null;
}

function rowToRecord_(row, controlRow) {
  return {
    eventNo: Number(row[0]) || 0,
    name: String(row[1] || ""),
    venue: String(row[2] || ""),
    eventDate: String(row[3] || ""),
    startTime: String(row[4] || ""),
    expiresAtMs: Number(row[5]) || 0,
    sheetName: String(row[6] || ""),
    codeHash: String(row[7] || ""),
    codeVersion: String(row[8] || ""),
    status: String(row[9] || ""),
    createdAtMs: Number(row[10]) || 0,
    updatedAtMs: Number(row[11]) || 0,
    controlRow: controlRow
  };
}

function publicEvent_(record) {
  return {
    eventNo: record.eventNo,
    name: record.name,
    venue: record.venue,
    eventDate: record.eventDate,
    startTime: record.startTime,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
    sheetName: record.sheetName,
    status: record.status
  };
}

function requireAdmin_(token) {
  const value = CacheService.getScriptCache().get("adminSession:" + String(token || ""));
  if (!value) throw apiError_("SESSION_EXPIRED", "Your administrator session expired. Sign in again.");
  const session = JSON.parse(value);
  if (session.expiresAt <= Date.now()) throw apiError_("SESSION_EXPIRED", "Your administrator session expired. Sign in again.");
  const adminVersion = PropertiesService.getScriptProperties().getProperty("ADMIN_VERSION") || "legacy";
  if (session.adminVersion !== adminVersion) throw apiError_("SESSION_EXPIRED", "The administrator password changed. Sign in again.");
  return session;
}

function requireScannerSession_(token) {
  const value = CacheService.getScriptCache().get("scannerSession:" + String(token || ""));
  if (!value) throw apiError_("SESSION_EXPIRED", "The scanner session expired. Enter the current control code again.");
  const session = JSON.parse(value);
  if (session.expiresAt <= Date.now()) throw apiError_("SESSION_EXPIRED", "The scanner session expired. Enter the current control code again.");
  return session;
}

function consumeChallenge_(nonce, expectedScope) {
  const key = "challenge:" + String(nonce || "");
  const cache = CacheService.getScriptCache();
  const scope = cache.get(key);
  cache.remove(key);
  if (scope !== expectedScope) throw apiError_("CHALLENGE_EXPIRED", "The secure sign-in request expired. Try again.");
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw apiError_("NOT_CONFIGURED", "Run USG Attendance setup from the Google Sheet first.");
}

function ensureConfigured_() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty("SPREADSHEET_ID") || !properties.getProperty("ADMIN_PASSWORD_HASH")) {
    throw apiError_("NOT_CONFIGURED", "Open the Google Sheet and run USG Attendance > Initialize / Change Admin Password.");
  }
}

function ensureSheetRows_(sheet, row) {
  if (sheet.getMaxRows() < row) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
}

function studentNumberFromQr_(payload) {
  try {
    const decoded = JSON.parse(String(payload));
    if (decoded.a === "PSU-USG" && Number(decoded.v) === 1) return normalizeStudentNumber_(decoded.s);
  } catch (error) {
    const match = String(payload).match(/^PSU-USG\|1\|(.+)$/i);
    if (match) return normalizeStudentNumber_(match[1]);
  }
  return "";
}

function normalizeStudentNumber_(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeProgram_(value) {
  const text = String(value || "").trim();
  const key = text.toUpperCase().replace(/[^A-Z]/g, "");
  if (key === "BEED" || key.indexOf("ELEMENTARYEDUCATION") >= 0) return "BEEd";
  if (key === "BSE" || key.indexOf("ENTREPRENEUR") >= 0) return "BSE";
  if (key === "BSA" || key.indexOf("AGRICULTURE") >= 0) return "BSA";
  return text;
}

function validDateText_(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw apiError_("BAD_DATE", "Use a valid event date.");
  return text;
}

function validTimeText_(value) {
  const text = String(value || "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw apiError_("BAD_TIME", "Use a valid start time.");
  return text;
}

function parseLocalDateTime_(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) throw apiError_("BAD_EXPIRY", "Use a valid control-code expiry date and time.");
  try {
    return Utilities.parseDate(text, TIME_ZONE, "yyyy-MM-dd'T'HH:mm").getTime();
  } catch (error) {
    throw apiError_("BAD_EXPIRY", "Use a valid control-code expiry date and time.");
  }
}

function requiredText_(value, label, maxLength) {
  const text = cleanText_(value);
  if (!text) throw apiError_("MISSING_FIELD", label + " is required.");
  return text.slice(0, maxLength);
}

function cleanText_(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function safeCellText_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function hash_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) { return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"); }).join("");
}

function randomToken_() {
  return hash_(Utilities.getUuid() + ":" + Date.now() + ":" + Math.random());
}

function randomControlCode_() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seed = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    const value = seed[i] < 0 ? seed[i] + 256 : seed[i];
    code += alphabet[value % alphabet.length];
  }
  return code;
}

function safeEqual_(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function validCallback_(value) {
  const callback = String(value || "callback");
  return /^[A-Za-z_$][0-9A-Za-z_$.]*$/.test(callback) ? callback : "callback";
}

function jsonp_(callback, payload) {
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function apiError_(code, message) {
  const error = new Error(message);
  error.code = code;
  error.expose = true;
  return error;
}
