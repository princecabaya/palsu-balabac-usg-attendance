import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [css, generator, page, idCard, client] = await Promise.all([
  readFile(new URL("../assets/css/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/generator.js", import.meta.url), "utf8"),
  readFile(new URL("../generator.html", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/id-card.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/supabase-client.js", import.meta.url), "utf8"),
]);

test("student IDs use an A6 portrait canvas", () => {
  assert.match(css, /\.student-id\s*\{[^}]*width:\s*105mm;[^}]*height:\s*148mm;/s);
});

test("printing places two front-and-back ID pairs on each A4 page", () => {
  assert.match(css, /@page\s+id-sheet\s*\{[^}]*size:\s*A4\s+portrait;[^}]*margin:\s*0;/s);
  assert.match(css, /\.id-sheet\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*105mm\);[^}]*grid-template-rows:\s*repeat\(2,\s*148mm\);[^}]*page:\s*id-sheet;/s);
  assert.match(generator, /index\s*%\s*2\s*===\s*0/);
  assert.match(generator, /className\s*=\s*"id-sheet"/);
  assert.match(generator, /renderStudentIdPair/);
});

test("photo and QR are equal-size side-by-side panels", () => {
  assert.match(idCard, /class="id-media-row"/);
  assert.match(css, /\.id-photo,\s*\.id-qr\s*\{[^}]*width:\s*42mm;[^}]*height:\s*42mm;/s);
  assert.match(css, /\.id-media-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*42mm\);/s);
});

test("student ID includes a blank signature line", () => {
  assert.match(idCard, /class="id-signature"/);
  assert.match(idCard, /STUDENT'S SIGNATURE/);
  assert.match(page, /styles\.css\?v=20260915\.4/);
  assert.match(page, /generator\.js\?v=20260915\.6/);
});

test("ID Generator loads enrolled students through Supabase administrator access", () => {
  assert.match(page, /@supabase\/supabase-js/);
  assert.match(page, /id="generator-admin-email"/);
  assert.match(generator, /signInAdmin/);
  assert.match(generator, /listStudents/);
  assert.match(generator, /privateAssetUrls\("student-photos"/);
  assert.match(generator, /profileDisplayName/);
  assert.match(client, /createSignedUrls/);
  assert.match(client, /date_of_birth, address, phone, emergency_contact_name, emergency_contact_phone/);
  assert.doesNotMatch(generator, /adminLogin|jsonp\("students"/);
  assert.doesNotMatch(page, /Google Sheet setup/);
});

test("generated QR codes use a high-contrast, scanner-friendly setting", () => {
  assert.match(idCard, /colorDark:\s*"#000000"/);
  assert.match(idCard, /correctLevel:\s*window\.QRCode\.CorrectLevel\.M/);
});

test("all generated IDs can be downloaded in one ZIP archive", () => {
  assert.match(page, /jszip\/3\.10\.1\/jszip\.min\.js/);
  assert.match(page, /id="download-cards"/);
  assert.match(generator, /querySelectorAll\("\.student-id"\)/);
  assert.match(generator, /new\s+JSZip\(\)/);
  assert.match(generator, /zip\.file\(`PSU-USG-A6-ID-\$\{studentNumber\}-\$\{side\}\.png`/);
  assert.match(generator, /zip\.generateAsync\(\{\s*type:\s*"blob"\s*\}/);
});
