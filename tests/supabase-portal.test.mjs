import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync(new URL("../assets/js/config.js", import.meta.url), "utf8");
const portal = fs.readFileSync(new URL("../portal.html", import.meta.url), "utf8");
const portalSource = fs.readFileSync(new URL("../assets/js/portal.js", import.meta.url), "utf8");
const idCardSource = fs.readFileSync(new URL("../assets/js/id-card.js", import.meta.url), "utf8");
const studentsPage = fs.readFileSync(new URL("../students.html", import.meta.url), "utf8");
const studentsSource = fs.readFileSync(new URL("../assets/js/students.js", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../assets/js/supabase-client.js", import.meta.url), "utf8");
const attendanceApi = fs.readFileSync(new URL("../assets/js/supabase-attendance-api.js", import.meta.url), "utf8");
const sharedApi = fs.readFileSync(new URL("../assets/js/api.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/001_attendance_portal.sql", import.meta.url), "utf8");
const adminFunction = fs.readFileSync(new URL("../supabase/functions/admin-students/index.ts", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../assets/css/styles.css", import.meta.url), "utf8");

test("public config contains only the Supabase publishable key", () => {
  assert.match(config, /supabaseUrl:\s*"https:\/\/edfcehmttcwhhknywflq\.supabase\.co"/);
  assert.match(config, /supabasePublishableKey:\s*"sb_publishable_/);
  assert.doesNotMatch(config, /(?:supabaseSecretKey|serviceRoleKey|supabaseServiceRoleKey)\s*:/i);
  assert.match(config, /adminEmail:\s*""/);
  assert.doesNotMatch(config, /@gmail\.com/i);
});

test("students sign in with their student number and must change temporary passwords", () => {
  assert.match(portal, /id="student-username"/);
  assert.match(portal, /id="password-change"/);
  assert.match(client, /studentNumberToEmail/);
  assert.match(portalSource, /profile\.must_change_password/);
  assert.match(portalSource, /changeStudentPassword/);
});

test("student portal does not expose organizer navigation", () => {
  assert.doesNotMatch(portal, /href="(?:index|generator|dashboard|reports)\.html"/);
  assert.doesNotMatch(portal, /<nav\b/);
  assert.match(portal, /id="portal-logout"/);
});

test("student profile collects requested back-of-ID and emergency fields", () => {
  for (const id of ["profile-birth-date", "profile-address", "profile-phone", "profile-emergency-name", "profile-emergency-phone", "profile-photo"]) {
    assert.match(portal, new RegExp(`id="${id}"`));
  }
  assert.match(portalSource, /renderStudentIdPair/);
  assert.match(portalSource, /saveStudentIdCopy\("front"/);
  assert.match(portalSource, /saveStudentIdCopy\("back"/);
});

test("back of ID is headerless, signature-free and carries the required return notice", () => {
  assert.doesNotMatch(idCardSource, /id-back-header|id-back-signature/);
  assert.match(idCardSource, /Kindly return this ID to the owner if found\./);
  assert.match(idCardSource, /This is an unofficial ID\. Still wear your valid PalSU ID\./);
});

test("students can generate an A4 PDF with front in Q2 and back in Q1", () => {
  assert.match(portal, /jspdf\/2\.5\.2\/jspdf\.umd\.min\.js/);
  assert.match(portal, /id="download-id-pdf"/);
  assert.match(portalSource, /new JsPdf\(\{ orientation: "portrait", unit: "mm", format: "a4"/);
  assert.match(portalSource, /quadrantWidth\s*=\s*105/);
  assert.match(portalSource, /quadrantHeight\s*=\s*148\.5/);
  assert.match(portalSource, /addImage\(frontCanvas[^\n]*0, 0, quadrantWidth, quadrantHeight/);
  assert.match(portalSource, /addImage\(backCanvas[^\n]*quadrantWidth, 0, quadrantWidth, quadrantHeight/);
});

test("students can download a real Excel attendance report", () => {
  assert.match(portal, /exceljs\/4\.4\.0\/exceljs\.min\.js/);
  assert.match(portal, /id="download-own-report"/);
  assert.match(portalSource, /new window\.ExcelJS\.Workbook/);
  assert.match(portalSource, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(portalSource, /groupAttendanceSessions/);
  assert.match(portalSource, /First Time In/);
  assert.match(portalSource, /Second Time Out/);
  assert.match(portal, /activities attended/);
});

test("administrator enrollment shows temporary credentials once and resets rather than retrieves passwords", () => {
  assert.match(studentsPage, /id="student-admin-email"/);
  assert.match(studentsPage, /id="enrollment-form"/);
  assert.match(studentsPage, /id="credential-panel"/);
  assert.match(studentsSource, /Reset password/);
  assert.match(studentsSource, /action:\s*"enroll"/);
  assert.match(studentsSource, /resetPassword/);
  assert.doesNotMatch(studentsPage, /existing password|view password/i);
  assert.match(adminFunction, /temporaryPassword\(\)/);
  assert.match(adminFunction, /admin\.auth\.admin\.updateUserById/);
  assert.match(studentsPage, /Enroll a complete roster/);
});

test("administrators can correct misspelled student names with an audit trail", () => {
  assert.match(studentsPage, /id="student-name-dialog"/);
  assert.match(studentsSource, /Correct name/);
  assert.match(studentsSource, /action:\s*"correctName"/);
  assert.match(adminFunction, /action === "correctName"/);
  assert.match(adminFunction, /student\.name_corrected/);
  assert.match(adminFunction, /before:/);
  assert.match(adminFunction, /after:/);
});

test("new-account panel fills the row while temporary credentials are hidden", () => {
  assert.match(styles, /\.student-admin-grid:has\(\.credential-panel\[hidden\]\)\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(studentsPage, /styles\.css\?v=20260915\.8/);
});

test("database uses RLS, paired attendance, idempotency and audited corrections", () => {
  assert.match(migration, /alter table public\.profiles enable row level security/);
  assert.match(migration, /one_open_attendance_session/);
  assert.match(migration, /time_in_request_id text not null unique/);
  assert.match(migration, /time_out_request_id text unique/);
  assert.match(migration, /function public\.correct_attendance/);
  assert.match(migration, /insert into public\.audit_log/);
  assert.match(migration, /student-photos/);
  assert.match(migration, /student-id-copies/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /extensions\.gen_random_bytes/);
  assert.doesNotMatch(migration, /(?<!extensions\.)\bdigest\(/);
});

test("legacy attendance stays active until the explicit Supabase cutover", () => {
  assert.match(config, /backendMode:\s*"legacy"/);
  assert.match(sharedApi, /usesSupabaseBackend\(\)/);
  assert.match(sharedApi, /return supabaseAction\(action, params\)/);
});

test("Supabase attendance adapter preserves the scanner and dashboard response shape", () => {
  assert.match(attendanceApi, /exchange_scanner_code/);
  assert.match(attendanceApi, /record_attendance/);
  assert.match(attendanceApi, /scanner_student_history/);
  assert.match(attendanceApi, /timestamp:\s*result\.recordedAt/);
  assert.match(attendanceApi, /sheetName:\s*"Supabase"/);
});
