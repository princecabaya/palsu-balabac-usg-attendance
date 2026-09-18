import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scanner = fs.readFileSync(new URL("../scanner.html", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../site-admin.html", import.meta.url), "utf8");
const publicSource = fs.readFileSync(new URL("../assets/js/site-public.js", import.meta.url), "utf8");
const adminSource = fs.readFileSync(new URL("../assets/js/site-admin.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/004_usg_site.sql", import.meta.url), "utf8");

test("the repository homepage is now the public PalSU Balabac USG Site", () => {
  assert.match(home, /Official University Student Government Site/);
  assert.match(home, /href="announcements\.html"/);
  assert.match(home, /href="events\.html"/);
  assert.match(home, /href="officers\.html"/);
  assert.match(home, /href="projects\.html"/);
  assert.match(home, /href="transparency\.html"/);
  assert.match(home, /href="portal\.html"/);
  assert.doesNotMatch(home, /id="qr-reader"/);
});

test("attendance scanning remains isolated on the scanner-only page", () => {
  assert.match(scanner, /id="qr-reader"/);
  assert.match(scanner, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(scanner, /site-admin\.html|generator\.html|reports\.html/);
});

test("public content is loaded from published Supabase website tables", () => {
  for (const table of ["site_announcements", "site_events", "site_officers", "site_projects", "site_documents"]) assert.match(publicSource, new RegExp(table));
  assert.match(publicSource, /\.eq\("is_published", true\)/);
});

test("website content administration requires the existing active administrator account", () => {
  assert.match(admin, /id="site-admin-login"/);
  assert.match(adminSource, /signInAdmin/);
  assert.match(adminSource, /profile\.role === "admin"/);
  assert.match(adminSource, /\.insert\(payload\)/);
  assert.match(adminSource, /\.update\(payload\)/);
  assert.match(adminSource, /\.delete\(\)/);
});

test("USG website tables expose published content publicly and reserve writes for administrators", () => {
  assert.match(migration, /create table if not exists public\.site_announcements/);
  assert.match(migration, /create table if not exists public\.site_documents/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /for select to anon using \(is_published\)/);
  assert.match(migration, /for select to authenticated using \(is_published or public\.is_admin\(\)\)/);
  assert.match(migration, /with check \(public\.is_admin\(\)\)/);
});
