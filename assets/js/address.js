export const BALABAC_BARANGAYS = Object.freeze([
  "Agutayan",
  "Bugsuk",
  "Bancalaan",
  "Indalawan",
  "Catagupan",
  "Malaking Ilog",
  "Mangsee",
  "Melville",
  "Pandanan",
  "Pasig",
  "Rabor",
  "Ramos",
  "Salang",
  "Sebaring",
  "Poblacion I",
  "Poblacion II",
  "Poblacion III",
  "Poblacion IV",
  "Poblacion V",
  "Poblacion VI",
]);

const POBLACION_ALIASES = [
  ["Poblacion VI", /\b(?:pob(?:lacion)?|pov)[.\s-]*(?:vi|6)\b/i],
  ["Poblacion V", /\b(?:pob(?:lacion)?|pov)[.\s-]*(?:v|5)\b/i],
  ["Poblacion IV", /\b(?:pob(?:lacion)?|pov)[.\s-]*(?:iv|4)\b/i],
  ["Poblacion III", /\b(?:pob(?:lacion)?|pov)[.\s-]*(?:iii|3)\b/i],
  ["Poblacion II", /\b(?:pob(?:lacion)?|pov)[.\s-]*(?:ii|2)\b/i],
  ["Poblacion I", /\b(?:pob(?:lacion)?|pov)[.\s-]*(?:i|1)\b/i],
];

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchBarangay(value) {
  for (const [name, pattern] of POBLACION_ALIASES) {
    if (pattern.test(value)) return { name, pattern };
  }

  for (const name of BALABAC_BARANGAYS.filter((entry) => !entry.startsWith("Poblacion"))) {
    const pattern = new RegExp(`\\b${escapeRegExp(name).replace(/\\ /g, "\\s+")}\\b`, "i");
    if (pattern.test(value)) return { name, pattern };
  }
  return null;
}

export function formatBalabacAddress({ detail = "", barangay = "" } = {}) {
  const selectedBarangay = BALABAC_BARANGAYS.find((name) => name.toLowerCase() === clean(barangay).toLowerCase());
  if (!selectedBarangay) return "";
  const localDetail = clean(detail).replace(/^[,;\s-]+|[,;\s-]+$/g, "");
  return [localDetail, `Barangay ${selectedBarangay}`, "Balabac", "Palawan"].filter(Boolean).join(", ");
}

export function parseStoredAddress(value) {
  const original = clean(value);
  if (!original) return { mode: "balabac", barangay: "", detail: "", manual: "" };

  const match = matchBarangay(original);
  if (!match || (!/\bbalabac\b/i.test(original) && !/\bpalawan\b/i.test(original))) {
    return { mode: "manual", barangay: "", detail: "", manual: original };
  }

  let detail = original
    .replace(new RegExp(`\\bbarangay\\s+(?:${escapeRegExp(match.name).replace(/\\ /g, "\\s+")})\\b`, "i"), " ")
    .replace(match.pattern, " ")
    .replace(/\bmimaropa(?:\s+region)?\b/gi, " ")
    .replace(/\bregion\s+iv-?b\b/gi, " ")
    .replace(/\bbalabac\b/gi, " ")
    .replace(/\bpalawan\b/gi, " ")
    .replace(/^[,;\s-]+|[,;\s-]+$/g, "")
    .replace(/\s*[,;]\s*[,;\s]*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

  return { mode: "balabac", barangay: match.name, detail, manual: "" };
}
