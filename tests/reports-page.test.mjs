import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reportPage = fs.readFileSync(new URL("../reports.html", import.meta.url), "utf8");
const reportSource = fs.readFileSync(new URL("../assets/js/reports.js", import.meta.url), "utf8");
const backendSource = fs.readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
const organizerPages = ["../index.html", "../generator.html", "../dashboard.html"]
  .map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("organizer navigation includes the administrator Reports tab", () => {
  for (const page of organizerPages) assert.match(page, /href="reports\.html">Reports<\/a>/);
  assert.match(reportPage, /class="is-active" href="reports\.html">Reports<\/a>/);
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

test("student reports require an administrator session in Apps Script", () => {
  assert.match(backendSource, /case "studentReport": result = studentReportAction_\(parameters\)/);
  const reportAction = backendSource.slice(
    backendSource.indexOf("function studentReportAction_"),
    backendSource.indexOf("function studentAttendanceReport_"),
  );
  assert.match(reportAction, /requireAdmin_\(parameters\.token\)/);
  assert.match(backendSource, /adminReports:\s*true/);
  assert.match(reportSource, /jsonp\("studentReport", \{ token: session\.token, studentNumber \}\)/);
});
