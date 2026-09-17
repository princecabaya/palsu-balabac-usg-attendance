import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboardPage = fs.readFileSync(new URL("../dashboard.html", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../assets/js/dashboard.js", import.meta.url), "utf8");
const attendanceApi = fs.readFileSync(new URL("../assets/js/supabase-attendance-api.js", import.meta.url), "utf8");
const scannerPage = fs.readFileSync(new URL("../scanner.html", import.meta.url), "utf8");
const mainScannerPage = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("control page uses Supabase administrator authentication without Apps Script setup", () => {
  assert.match(dashboardPage, /id="admin-email"/);
  assert.match(dashboardPage, /@supabase\/supabase-js/);
  assert.match(dashboardPage, /data-attendance-backend="supabase"/);
  assert.doesNotMatch(dashboardPage, /id="api-form"|script\.google\.com|Google Sheet events/);
  assert.match(dashboard, /signInAdmin\(elements\.password\.value, elements\.email\.value\.trim\(\)\)/);
  assert.match(dashboard, /supabaseAction\("createEvent"/);
  assert.match(dashboard, /supabaseAction\("listEvents"\)/);
  assert.match(dashboard, /supabaseAction\(action, \{ eventNo \}\)/);
});

test("scanner pages use Supabase control codes issued by the control page", () => {
  assert.match(scannerPage, /data-attendance-backend="supabase"/);
  assert.match(mainScannerPage, /data-attendance-backend="supabase"/);
  assert.match(scannerPage, /@supabase\/supabase-js/);
  assert.match(attendanceApi, /pageBackend === "supabase"/);
  assert.match(dashboard, /url\.searchParams\.set\("backend", "supabase"\)/);
});
