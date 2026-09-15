import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseRosterText } from "../assets/js/roster-import.js";

const page = fs.readFileSync(new URL("../students.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../assets/js/students.js", import.meta.url), "utf8");

test("parses the supplied Markdown roster column names", () => {
  const rows = parseRosterText(`
| Student Number | Last Name | Given Name | Middle Initial | Degree Program |
| :-- | :-- | :-- | :-- | :-- |
| **2025-10-0085BL** | **Abaca** | **Marry Jane** | **U** | **BEEd** |
| **2025-10-0002BL** | **Abaca** | **Riana** | **U** | **BSE** |
`, "md");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rowNumber: 2,
    studentNumber: "2025-10-0085BL",
    firstName: "Marry Jane",
    middleName: "U",
    lastName: "Abaca",
    suffix: "",
    program: "BEEd",
    errors: [],
    warnings: [],
    status: "ready",
    message: "",
  });
});

test("parses CSV and normalizes complete program labels", () => {
  const rows = parseRosterText("Student ID,Surname,First Name,MI,Program\n2026-10-0001BL,Dela Cruz,Juan,A,Bachelor of Elementary Education\n", "csv");
  assert.equal(rows[0].program, "BEEd");
  assert.equal(rows[0].lastName, "Dela Cruz");
});

test("flags duplicate, invalid and unusual roster data before enrollment", () => {
  const rows = parseRosterText(`Student Number,Last Name,Given Name,Middle Initial,Degree Program
2026-00-0037BL,Duldula,Hamirol,A,BSE
2026-00-0037BL,Duldula,Second,A,Unknown`);
  assert.equal(rows[0].warnings.length, 1);
  assert.match(rows[1].errors.join(" "), /Duplicate student number/);
  assert.match(rows[1].errors.join(" "), /Unknown degree program/);
});

test("bulk enrollment runs through the existing secure function and exports credentials once", () => {
  assert.match(page, /id="bulk-roster-file"/);
  assert.match(page, /\.xlsx,\.csv,\.tsv,\.md,\.txt/);
  assert.match(page, /exceljs\/4\.4\.0\/exceljs\.min\.js/);
  assert.match(source, /Math\.min\(3, queue\.length\)/);
  assert.match(source, /action:\s*"enroll"/);
  assert.match(source, /USG-Temporary-Credentials-/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*bulk/i);
});
