import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync(new URL("../assets/js/config.js", import.meta.url), "utf8");
const portal = fs.readFileSync(new URL("../portal.html", import.meta.url), "utf8");
const portalSource = fs.readFileSync(new URL("../assets/js/portal.js", import.meta.url), "utf8");
const studentsPage = fs.readFileSync(new URL("../students.html", import.meta.url), "utf8");
const studentsSource = fs.readFileSync(new URL("../assets/js/students.js", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../assets/js/supabase-client.js", import.meta.url), "utf8");
const attendanceApi = fs.readFileSync(new URL("../assets/js/supabase-attendance-api.js", import.meta.url), "utf8");
const sharedApi = fs.readFileSync(new URL("../assets/js/api.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/001_attendance_portal.sql", import.meta.url), "utf8");
const adminFunction = fs.readFileSync(new URL("../supabase/functions/admin-students/index.ts", import.meta.url), "utf8");

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

test("student profile collects requested back-of-ID and emergency fields", () => {
  for (const id of ["profile-birth-date", "profile-address", "profile-phone", "profile-emergency-name", "profile-emergency-phone", "profile-photo"]) {
    assert.match(portal, new RegExp(`id="${id}"`));
  }
  assert.match(portalSource, /renderStudentIdPair/);
  assert.match(portalSource, /saveStudentIdCopy\("front"/);
  assert.match(portalSource, /saveStudentIdCopy\("back"/);
});

test("students can download a real Excel attendance report", () => {
  assert.match(portal, /exceljs\/4\.4\.0\/exceljs\.min\.js/);
  assert.match(portal, /id="download-own-report"/);
  assert.match(portalSource, /new window\.ExcelJS\.Workbook/);
  assert.match(portalSource, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
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
