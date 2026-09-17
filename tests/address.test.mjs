import test from "node:test";
import assert from "node:assert/strict";
import { BALABAC_BARANGAYS, formatBalabacAddress, parseStoredAddress } from "../assets/js/address.js";

test("Balabac address choices use all 20 official barangays", () => {
  assert.equal(BALABAC_BARANGAYS.length, 20);
  for (const barangay of ["Agutayan", "Bancalaan", "Rabor", "Poblacion VI"]) {
    assert.ok(BALABAC_BARANGAYS.includes(barangay));
  }
});

test("guided addresses are stored in a consistent ID-ready format", () => {
  assert.equal(
    formatBalabacAddress({ detail: "  Purok 6 ", barangay: "Poblacion VI" }),
    "Purok 6, Barangay Poblacion VI, Balabac, Palawan",
  );
});

test("a common misspelled Poblacion address is recognized and corrected", () => {
  assert.deepEqual(parseStoredAddress("POV.6 balabac Palawan"), {
    mode: "balabac",
    barangay: "Poblacion VI",
    detail: "",
    manual: "",
  });
});

test("addresses outside Balabac remain editable as manual addresses", () => {
  assert.deepEqual(parseStoredAddress("Barangay San Miguel, Puerto Princesa City, Palawan"), {
    mode: "manual",
    barangay: "",
    detail: "",
    manual: "Barangay San Miguel, Puerto Princesa City, Palawan",
  });
});
