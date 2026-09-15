const HEADER_ALIASES = {
  studentNumber: ["studentnumber", "studentno", "studentid", "idnumber", "username"],
  lastName: ["lastname", "surname", "familyname"],
  firstName: ["firstname", "givenname", "givenfirstname"],
  middleName: ["middlename", "middleinitial", "mi"],
  program: ["program", "degreeprogram", "course", "degreecourse"],
};

export async function parseRosterFile(file) {
  if (!file) throw new Error("Choose a roster file first.");
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "xlsx") {
    if (!window.ExcelJS) throw new Error("The Excel reader did not load. Refresh the page and try again.");
    const workbook = new window.ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("The Excel workbook has no worksheet.");
    const matrix = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => matrix.push(Array.from(row.values).slice(1)));
    return rosterFromMatrix(matrix);
  }
  return parseRosterText(await file.text(), extension);
}

export function parseRosterText(text, typeHint = "") {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const markdown = typeHint === "md" || /^\s*\|/.test(source);
  return rosterFromMatrix(markdown ? markdownMatrix(source) : delimitedMatrix(source, typeHint));
}

export function normalizeRosterProgram(value) {
  const compact = clean(value).toLowerCase().replace(/[^a-z]/g, "");
  if (compact === "beed" || compact.includes("elementaryeducation")) return "BEEd";
  if (compact === "bse" || compact.includes("entrepreneur")) return "BSE";
  if (compact === "bsa" || compact.includes("agriculture")) return "BSA";
  return "";
}

function rosterFromMatrix(matrix) {
  const headerIndex = matrix.findIndex((row) => {
    const keys = row.map(headerKey);
    return hasAlias(keys, "studentNumber") && hasAlias(keys, "lastName")
      && hasAlias(keys, "firstName") && hasAlias(keys, "program");
  });
  if (headerIndex < 0) {
    throw new Error("Could not find the roster headings. Include Student Number, Last Name, Given Name and Degree Program columns.");
  }

  const header = matrix[headerIndex].map(headerKey);
  const indexes = Object.fromEntries(Object.keys(HEADER_ALIASES).map((field) => [field, aliasIndex(header, field)]));
  const seen = new Set();
  return matrix.slice(headerIndex + 1).map((row, offset) => {
    const studentNumber = clean(row[indexes.studentNumber]).toUpperCase().replace(/\s+/g, "");
    const firstName = clean(row[indexes.firstName]);
    const middleName = indexes.middleName >= 0 ? clean(row[indexes.middleName]) : "";
    const lastName = clean(row[indexes.lastName]);
    const program = normalizeRosterProgram(row[indexes.program]);
    if (![studentNumber, firstName, lastName, clean(row[indexes.program])].some(Boolean)) return null;
    const errors = [];
    const warnings = [];
    if (!studentNumber) errors.push("Missing student number");
    if (!firstName) errors.push("Missing given name");
    if (!lastName) errors.push("Missing last name");
    if (!program) errors.push("Unknown degree program");
    if (studentNumber && seen.has(studentNumber)) errors.push("Duplicate student number in file");
    if (studentNumber && !/^\d{4}-10-\d{4}[A-Z]{2}$/.test(studentNumber)) warnings.push("Unusual student-number format—verify before continuing");
    seen.add(studentNumber);
    return {
      rowNumber: headerIndex + offset + 2,
      studentNumber,
      firstName,
      middleName,
      lastName,
      suffix: "",
      program,
      errors,
      warnings,
      status: errors.length ? "invalid" : "ready",
      message: errors.join("; ") || warnings.join("; "),
    };
  }).filter(Boolean);
}

function markdownMatrix(text) {
  return text.split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map(clean))
    .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, ""))));
}

function delimitedMatrix(text, typeHint) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = typeHint === "tsv" || (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { row.push(clean(cell)); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(clean(cell));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(clean(cell));
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function clean(value) {
  return String(value ?? "").replace(/\*\*|`/g, "").trim().replace(/\s+/g, " ");
}

function headerKey(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function aliasIndex(header, field) { return header.findIndex((key) => HEADER_ALIASES[field].includes(key)); }
function hasAlias(header, field) { return aliasIndex(header, field) >= 0; }
