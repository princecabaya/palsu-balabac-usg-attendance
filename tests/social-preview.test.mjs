import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("../assets/img/usg-site-social-preview.svg", import.meta.url), "utf8");

test("public USG homepage defines a large social sharing preview", () => {
  assert.match(home, /property="og:title" content="PalSU Balabac University Student Government"/);
  assert.match(home, /property="og:image" content="https:\/\/princecabaya\.github\.io\/palsu-balabac-usg-attendance\/assets\/img\/usg-site-social-preview\.png"/);
  assert.match(home, /name="twitter:card" content="summary_large_image"/);
});

test("social preview art has the standard 1200 by 630 sharing dimensions", () => {
  assert.match(preview, /width="1200" height="630"/);
  assert.match(preview, /University Student Government Site/);
});
