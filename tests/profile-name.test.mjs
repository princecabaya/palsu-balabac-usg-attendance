import test from "node:test";
import assert from "node:assert/strict";

import { formatMiddleName, profileDisplayName } from "../assets/js/supabase-client.js";

test("single-letter middle initials always display with a period", () => {
  assert.equal(formatMiddleName("u"), "U.");
  assert.equal(formatMiddleName("U."), "U.");
  assert.equal(profileDisplayName({ first_name: "Marry Jane", middle_name: "U", last_name: "Abaca" }), "Marry Jane U. Abaca");
});

test("complete middle names are not changed", () => {
  assert.equal(formatMiddleName("Marie"), "Marie");
  assert.equal(profileDisplayName({ first_name: "Ana", middle_name: "Marie", last_name: "Santos", suffix: "Jr." }), "Ana Marie Santos Jr.");
});
