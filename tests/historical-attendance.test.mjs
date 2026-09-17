import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { resolveHistoricalStudent } from "../assets/js/attendance-import.js";
import { groupAttendanceSessions } from "../assets/js/attendance-report.js";

function roster(entries) {
  const byId = new Map(entries.map((entry) => [entry.studentNumber, entry]));
  const byName = new Map();
  entries.forEach((entry) => byName.set(entry.nameKey, [...(byName.get(entry.nameKey) || []), entry]));
  return { entries, byId, byName };
}

test("historical attendance resolves workbook student-number typos by a unique student name", () => {
  const students = roster([
    { studentNumber: "2026-10-0058BL", nameKey: "jerezpiahd" },
    { studentNumber: "2026-10-0115BL", nameKey: "talurongcheryannf" },
    { studentNumber: "2026-10-0007BL", nameKey: "amitentonc" },
  ]);

  assert.deepEqual(resolveHistoricalStudent("2026-10-0007BL", "Ami, Tenton C.", students), {
    studentNumber: "2026-10-0007BL", matched: true, corrected: false,
  });
  assert.deepEqual(resolveHistoricalStudent("2O26-10-0058BL", "Jerez, Piah D.", students), {
    studentNumber: "2026-10-0058BL", matched: true, corrected: true,
  });
  assert.deepEqual(resolveHistoricalStudent("2026-10-0155BL", "Talurong, Chery-ann F.", students), {
    studentNumber: "2026-10-0115BL", matched: true, corrected: true,
  });
});

test("historical attendance does not trust a valid number when it belongs to a different student", () => {
  const students = roster([
    { studentNumber: "2025-10-0109BL", nameKey: "prietofrancined" },
    { studentNumber: "2025-10-0111BL", nameKey: "ramosmalkiep" },
    { studentNumber: "2024-10-0090BL", nameKey: "hamilonnordayat" },
  ]);

  assert.deepEqual(resolveHistoricalStudent("2025-10-0109BL", "Ramos, Malkie P.", students), {
    studentNumber: "2025-10-0111BL", matched: true, corrected: true,
  });
  assert.deepEqual(resolveHistoricalStudent("2024-10-0088BL", "Hamilon, Nur-Daya T.", students), {
    studentNumber: "2024-10-0090BL", matched: true, corrected: true,
  });
  assert.deepEqual(resolveHistoricalStudent("2025-10-0109BL", "Prieto, Francine D.", students), {
    studentNumber: "2025-10-0109BL", matched: true, corrected: false,
  });
});

test("student report combines two sessions for one activity without hiding either pair", () => {
  const rows = [
    {
      event_id: "event-1", event_name: "USG Election 2026", venue: "Room 7",
      time_in: "2026-09-10T00:30:00.000Z", time_out: "2026-09-10T01:30:00.000Z", total_seconds: 3600,
    },
    {
      event_id: "event-1", event_name: "USG Election 2026", venue: "Room 7",
      time_in: "2026-09-10T05:00:00.000Z", time_out: "2026-09-10T06:15:00.000Z", total_seconds: 4500,
    },
  ];

  const report = groupAttendanceSessions(rows);
  assert.equal(report.length, 1);
  assert.equal(report[0].first_time_in, rows[0].time_in);
  assert.equal(report[0].first_time_out, rows[0].time_out);
  assert.equal(report[0].second_time_in, rows[1].time_in);
  assert.equal(report[0].second_time_out, rows[1].time_out);
  assert.equal(report[0].total_seconds, 8100);
  assert.equal(report[0].session_count, 2);
});

test("historical import stays private, admin-only and duplicate-safe", () => {
  const studentsPage = fs.readFileSync(new URL("../students.html", import.meta.url), "utf8");
  const studentsSource = fs.readFileSync(new URL("../assets/js/students.js", import.meta.url), "utf8");
  const adminFunction = fs.readFileSync(new URL("../supabase/functions/admin-students/index.ts", import.meta.url), "utf8");

  assert.match(studentsPage, /id="historical-attendance-file"/);
  assert.match(studentsPage, /Only validated event, student-number, Time In and Time Out records are sent/);
  assert.match(studentsSource, /action:\s*"importAttendance"/);
  assert.match(adminFunction, /caller\?\.role !== "admin"/);
  assert.match(adminFunction, /upsert\(batch, \{ onConflict: "time_in_request_id" \}\)/);
  assert.match(adminFunction, /attendance\.historical_import/);
  assert.match(adminFunction, /record\.slot/);
});
