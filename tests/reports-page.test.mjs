import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reportPage = fs.readFileSync(new URL("../reports.html", import.meta.url), "utf8");
const reportSource = fs.readFileSync(new URL("../assets/js/reports.js", import.meta.url), "utf8");
const attendanceApi = fs.readFileSync(new URL("../assets/js/supabase-attendance-api.js", import.meta.url), "utf8");
const organizerPages = ["../generator.html", "../dashboard.html", "../reports.html", "../students.html"]
  .map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("organizer navigation includes the administrator Reports tab", () => {
  for (const page of organizerPages) assert.match(page, /href="reports\.html">Reports<\/a>/);
  assert.match(reportPage, /class="is-active" href="reports\.html">Reports<\/a>/);
});

test("organizer navigation keeps the Students tab on every organizer page", () => {
  for (const page of organizerPages) assert.match(page, /href="students\.html">Students<\/a>/);
});

test("organizer navigation links back to the public USG site and website content administration", () => {
  for (const page of organizerPages) {
    assert.match(page, /href="index\.html">Public Site<\/a>/);
    assert.match(page, /href="site-admin\.html">Site Content<\/a>/);
  }
});

test("reports search accepts a student name or student ID", () => {
  assert.match(reportPage, /id="report-student-search"/);
  assert.match(reportPage, /Student name or ID/);
  assert.match(reportSource, /student\.name} \${student\.studentNumber}/);
  assert.match(reportSource, /loadStudentReport\(studentNumber\)/);
});

test("reports expose activity times and printable CSV output", () => {
  assert.match(reportPage, /First in/);
  assert.match(reportPage, /Second out/);
  assert.match(reportPage, /id="print-student-report"/);
  assert.match(reportPage, /id="download-student-report"/);
  assert.match(reportSource, /window\.print\(\)/);
  assert.match(reportSource, /text\/csv/);
});

test("reports use the Supabase administrator session instead of Google Apps Script", () => {
  assert.match(reportPage, /id="report-email"/);
  assert.match(reportPage, /@supabase\/supabase-js/);
  assert.match(reportPage, /data-attendance-backend="supabase"/);
  assert.match(reportSource, /signInAdmin\(elements\.password\.value, elements\.email\.value\.trim\(\)\)/);
  assert.match(reportSource, /getOwnProfile/);
  assert.match(reportSource, /supabaseAction\("students"\)/);
  assert.match(reportSource, /supabaseAction\("studentReport", \{ studentNumber \}\)/);
  assert.doesNotMatch(reportSource, /jsonp|Google Sheet|getApiUrl|adminLogin/);
});

test("Supabase reports combine repeated sessions into first and second attendance pairs", () => {
  assert.match(attendanceApi, /groupAttendanceSessions\(rows \|\| \[\]\)/);
  assert.match(attendanceApi, /secondTimeIn:\s*row\.second_time_in/);
  assert.match(attendanceApi, /secondTimeOut:\s*row\.second_time_out/);
});
