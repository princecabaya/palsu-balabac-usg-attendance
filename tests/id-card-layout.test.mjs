import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [css, generator, page] = await Promise.all([
  readFile(new URL("../assets/css/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/generator.js", import.meta.url), "utf8"),
  readFile(new URL("../generator.html", import.meta.url), "utf8"),
]);

test("student IDs use an A6 portrait canvas and print page", () => {
  assert.match(css, /\.student-id\s*\{[^}]*width:\s*105mm;[^}]*height:\s*148mm;/s);
  assert.match(css, /@page\s+id-card\s*\{[^}]*size:\s*105mm\s+148mm;/s);
  assert.match(css, /\.student-id\s*\{[^}]*page:\s*id-card;/s);
});

test("photo and QR are equal-size side-by-side panels", () => {
  assert.match(generator, /class="id-media-row"/);
  assert.match(css, /\.id-photo,\s*\.id-qr\s*\{[^}]*width:\s*42mm;[^}]*height:\s*42mm;/s);
  assert.match(css, /\.id-media-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*42mm\);/s);
});

test("student ID includes a blank signature line", () => {
  assert.match(generator, /class="id-signature"/);
  assert.match(generator, /STUDENT'S SIGNATURE/);
  assert.match(page, /styles\.css\?v=20260905\.3/);
  assert.match(page, /generator\.js\?v=20260905\.3/);
});
