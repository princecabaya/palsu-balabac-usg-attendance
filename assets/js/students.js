import { clearStatus, escapeHtml, setStatus } from "./common.js";
import { administerStudent, getOwnProfile, getSession, listStudents, normalizeStudentNumber, profileDisplayName, signInAdmin, signOut } from "./supabase-client.js";
import { parseRosterFile } from "./roster-import.js";

const elements = {
  login: document.querySelector("#student-admin-login"), loginForm: document.querySelector("#student-admin-login-form"), email: document.querySelector("#student-admin-email"), password: document.querySelector("#student-admin-password"), loginStatus: document.querySelector("#student-admin-login-status"), logout: document.querySelector("#student-admin-logout"), content: document.querySelector("#student-admin-content"),
  form: document.querySelector("#enrollment-form"), number: document.querySelector("#enroll-student-number"), firstName: document.querySelector("#enroll-first-name"), middleName: document.querySelector("#enroll-middle-name"), lastName: document.querySelector("#enroll-last-name"), suffix: document.querySelector("#enroll-suffix"), program: document.querySelector("#enroll-program"), enrollmentStatus: document.querySelector("#enrollment-status"),
  credentials: document.querySelector("#credential-panel"), credentialUsername: document.querySelector("#credential-username"), credentialPassword: document.querySelector("#credential-password"), copyCredentials: document.querySelector("#copy-credentials"), printCredentials: document.querySelector("#print-credentials"), clearCredentials: document.querySelector("#clear-credentials"),
  bulkFile: document.querySelector("#bulk-roster-file"), reviewBulk: document.querySelector("#review-bulk-roster"), bulkStatus: document.querySelector("#bulk-roster-status"), bulkReview: document.querySelector("#bulk-review"), bulkSummary: document.querySelector("#bulk-summary"), bulkWarningConfirm: document.querySelector("#bulk-warning-confirm"), confirmWarnings: document.querySelector("#confirm-bulk-warnings"), bulkProgressWrap: document.querySelector("#bulk-progress-wrap"), bulkProgress: document.querySelector("#bulk-progress"), bulkProgressLabel: document.querySelector("#bulk-progress-label"), startBulk: document.querySelector("#start-bulk-enrollment"), downloadBulkCredentials: document.querySelector("#download-bulk-credentials"), downloadRosterTemplate: document.querySelector("#download-roster-template"), bulkPreviewBody: document.querySelector("#bulk-preview-body"),
  search: document.querySelector("#student-directory-search"), refresh: document.querySelector("#refresh-students"), body: document.querySelector("#student-directory-body"), directoryStatus: document.querySelector("#student-directory-status"),
};

let students = [];
let currentCredentials = null;
let bulkRows = [];
let bulkCredentials = [];
let bulkRunning = false;
elements.loginForm.addEventListener("submit", login);
elements.logout.addEventListener("click", logout);
elements.form.addEventListener("submit", enroll);
elements.refresh.addEventListener("click", loadStudents);
elements.search.addEventListener("input", renderStudents);
elements.body.addEventListener("click", handleStudentAction);
elements.copyCredentials.addEventListener("click", copyCredentials);
elements.printCredentials.addEventListener("click", printCredentials);
elements.clearCredentials.addEventListener("click", clearCredentials);
elements.reviewBulk.addEventListener("click", reviewBulkRoster);
elements.bulkFile.addEventListener("change", reviewBulkRoster);
elements.confirmWarnings.addEventListener("change", updateBulkButton);
elements.startBulk.addEventListener("click", startBulkEnrollment);
elements.downloadBulkCredentials.addEventListener("click", downloadCredentialsWorkbook);
elements.downloadRosterTemplate.addEventListener("click", downloadRosterTemplate);
restore();

async function restore() {
  try {
    if (!await getSession()) return;
    const profile = await getOwnProfile();
    if (profile.role === "admin" && profile.account_status === "active") await open();
  } catch { /* Show the sign-in form. */ }
}

async function login(event) {
  event.preventDefault();
  const button = event.submitter;
  busy(button, true, "Signing in…");
  clearStatus(elements.loginStatus);
  try {
    await signInAdmin(elements.password.value, elements.email.value.trim());
    elements.password.value = "";
    await open();
  } catch (error) {
    setStatus(elements.loginStatus, error.message, "error");
  } finally {
    busy(button, false, "Open student accounts");
  }
}

async function open() {
  elements.login.hidden = true;
  elements.content.hidden = false;
  elements.logout.hidden = false;
  await loadStudents();
}

async function logout() {
  await signOut();
  students = [];
  clearCredentials();
  elements.content.hidden = true;
  elements.logout.hidden = true;
  elements.login.hidden = false;
  elements.password.focus();
}

async function enroll(event) {
  event.preventDefault();
  const button = event.submitter;
  busy(button, true, "Creating account…");
  clearStatus(elements.enrollmentStatus);
  try {
    const result = await administerStudent({
      action: "enroll",
      studentNumber: normalizeStudentNumber(elements.number.value),
      firstName: elements.firstName.value,
      middleName: elements.middleName.value,
      lastName: elements.lastName.value,
      suffix: elements.suffix.value,
      program: elements.program.value,
    });
    showCredentials(result);
    elements.form.reset();
    setStatus(elements.enrollmentStatus, "Student enrolled. Give the temporary credentials directly to the student.", "success");
    await loadStudents();
  } catch (error) {
    setStatus(elements.enrollmentStatus, error.message, "error");
  } finally {
    busy(button, false, "Create student account");
  }
}

async function reviewBulkRoster() {
  if (!elements.bulkFile.files[0]) return;
  busy(elements.reviewBulk, true, "Reading…");
  clearStatus(elements.bulkStatus);
  try {
    bulkRows = await parseRosterFile(elements.bulkFile.files[0]);
    bulkCredentials = [];
    elements.downloadBulkCredentials.hidden = true;
    const existing = new Set(students.map((student) => normalizeStudentNumber(student.student_number)));
    bulkRows.forEach((row) => {
      if (!row.errors.length && existing.has(row.studentNumber)) {
        row.status = "existing";
        row.message = "Already enrolled—will be skipped";
      }
    });
    elements.bulkReview.hidden = false;
    elements.confirmWarnings.checked = false;
    renderBulkReview();
    setStatus(elements.bulkStatus, `${bulkRows.length} roster row${bulkRows.length === 1 ? "" : "s"} reviewed. Resolve errors and review warnings before enrollment.`, "success");
  } catch (error) {
    bulkRows = [];
    elements.bulkReview.hidden = true;
    setStatus(elements.bulkStatus, error.message, "error");
  } finally {
    busy(elements.reviewBulk, false, "Review roster");
  }
}

function renderBulkReview() {
  const counts = bulkCounts();
  elements.bulkSummary.innerHTML = `
    <div><strong>${bulkRows.length}</strong><span>rows</span></div>
    <div><strong>${counts.ready}</strong><span>ready</span></div>
    <div><strong>${counts.existing}</strong><span>already enrolled</span></div>
    <div><strong>${counts.warnings}</strong><span>warnings</span></div>
    <div><strong>${counts.invalid}</strong><span>errors</span></div>
  `;
  elements.bulkWarningConfirm.hidden = counts.warnings === 0;
  elements.bulkPreviewBody.innerHTML = bulkRows.map((row, index) => bulkRowMarkup(row, index)).join("");
  updateBulkButton();
}

function bulkRowMarkup(row, index) {
  const name = [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ");
  return `<tr data-bulk-index="${index}"><td>${row.rowNumber}</td><td><strong>${escapeHtml(name)}</strong><small>${escapeHtml(row.studentNumber)}</small></td><td>${escapeHtml(row.program || "—")}</td><td class="bulk-row-status">${bulkStatusMarkup(row)}</td></tr>`;
}

function bulkStatusMarkup(row) {
  const label = {
    ready: "Ready", creating: "Creating…", created: "Created",
    existing: "Skipped", failed: "Failed", invalid: "Invalid",
  }[row.status] || row.status;
  return `<span class="bulk-state bulk-state--${escapeHtml(row.status)}">${escapeHtml(label)}</span>${row.message ? `<small>${escapeHtml(row.message)}</small>` : ""}`;
}

function updateBulkRow(index) {
  const cell = elements.bulkPreviewBody.querySelector(`tr[data-bulk-index="${index}"] .bulk-row-status`);
  if (cell) cell.innerHTML = bulkStatusMarkup(bulkRows[index]);
}

function bulkCounts() {
  return bulkRows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    if (row.warnings.length) counts.warnings += 1;
    return counts;
  }, { ready: 0, existing: 0, invalid: 0, created: 0, failed: 0, creating: 0, warnings: 0 });
}

function updateBulkButton() {
  const counts = bulkCounts();
  const hasWarnings = counts.warnings > 0;
  const pending = counts.ready + counts.failed;
  elements.startBulk.disabled = bulkRunning || counts.invalid > 0 || pending === 0 || (hasWarnings && !elements.confirmWarnings.checked);
  elements.startBulk.textContent = counts.failed > 0 && counts.ready === 0 ? `Retry ${counts.failed} failed account${counts.failed === 1 ? "" : "s"}` : `Enroll ${pending} student${pending === 1 ? "" : "s"}`;
}

async function startBulkEnrollment() {
  if (elements.startBulk.disabled) return;
  const queue = bulkRows.map((row, index) => ({ row, index })).filter(({ row }) => row.status === "ready" || row.status === "failed");
  if (!window.confirm(`Create ${queue.length} student accounts? Keep this page open until the credentials Excel file downloads.`)) return;
  bulkRunning = true;
  elements.bulkFile.disabled = true;
  elements.reviewBulk.disabled = true;
  elements.bulkProgressWrap.hidden = false;
  elements.bulkProgress.max = queue.length;
  elements.bulkProgress.value = 0;
  updateBulkButton();
  clearStatus(elements.bulkStatus);
  let cursor = 0;
  let completed = 0;
  const runWorker = async () => {
    while (cursor < queue.length) {
      const item = queue[cursor];
      cursor += 1;
      item.row.status = "creating";
      item.row.message = "";
      updateBulkRow(item.index);
      try {
        const result = await administerStudent({
          action: "enroll",
          studentNumber: item.row.studentNumber,
          firstName: item.row.firstName,
          middleName: item.row.middleName,
          lastName: item.row.lastName,
          suffix: item.row.suffix,
          program: item.row.program,
        });
        item.row.status = "created";
        item.row.message = "Account and temporary password created";
        bulkCredentials.push({
          username: result.username,
          temporaryPassword: result.temporaryPassword,
          name: [item.row.firstName, item.row.middleName, item.row.lastName].filter(Boolean).join(" "),
          program: item.row.program,
        });
      } catch (error) {
        item.row.status = "failed";
        item.row.message = error.message;
      }
      completed += 1;
      elements.bulkProgress.value = completed;
      elements.bulkProgressLabel.textContent = `${completed} of ${queue.length} processed · ${bulkCredentials.length} credentials created`;
      updateBulkRow(item.index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, runWorker));
  bulkRunning = false;
  elements.bulkFile.disabled = false;
  elements.reviewBulk.disabled = false;
  const counts = bulkCounts();
  elements.bulkSummary.innerHTML = `<div><strong>${bulkCredentials.length}</strong><span>created</span></div><div><strong>${counts.failed}</strong><span>failed</span></div><div><strong>${counts.existing}</strong><span>skipped</span></div>`;
  elements.downloadBulkCredentials.hidden = bulkCredentials.length === 0;
  updateBulkButton();
  if (bulkCredentials.length) await downloadCredentialsWorkbook();
  setStatus(elements.bulkStatus, counts.failed
    ? `${bulkCredentials.length} accounts were created and ${counts.failed} failed. The successful credentials were downloaded; review the failed rows before retrying.`
    : `${bulkCredentials.length} accounts were created. The temporary credentials Excel file was downloaded. Store it securely.`, counts.failed ? "info" : "success");
  await loadStudents();
}

async function downloadCredentialsWorkbook() {
  if (!bulkCredentials.length) return;
  if (!window.ExcelJS) throw new Error("The Excel exporter did not load. Refresh the page before leaving it.");
  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = "PSU Balabac USG Attendance";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Temporary Credentials", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.addRow(["PALAWAN STATE UNIVERSITY – BALABAC CAMPUS"]);
  sheet.addRow(["USG Attendance — One-Time Student Credentials"]);
  sheet.addRow(["Confidential: give each password only to the verified student. Passwords must be changed at first login."]);
  sheet.addRow(["Username", "Temporary Password", "Student Name", "Program", "Student Portal"]);
  bulkCredentials.forEach((credential) => sheet.addRow([credential.username, credential.temporaryPassword, credential.name, credential.program, "https://princecabaya.github.io/palsu-balabac-usg-attendance/portal.html"]));
  sheet.mergeCells("A1:E1");
  sheet.mergeCells("A2:E2");
  sheet.mergeCells("A3:E3");
  sheet.getRow(1).font = { bold: true, size: 15, color: { argb: "FF173247" } };
  sheet.getRow(2).font = { bold: true, size: 12, color: { argb: "FFF06424" } };
  sheet.getRow(3).font = { italic: true, color: { argb: "FF9A3412" } };
  sheet.getRow(4).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF147CAD" } }; });
  sheet.columns = [{ width: 22 }, { width: 24 }, { width: 34 }, { width: 12 }, { width: 66 }];
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `USG-Temporary-Credentials-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function downloadRosterTemplate() {
  const template = "Student Number,Last Name,Given Name,Middle Initial,Degree Program\r\n2026-10-0001BL,Dela Cruz,Juan,A,BEEd\r\n";
  downloadBlob(new Blob(["\uFEFF", template], { type: "text/csv;charset=utf-8" }), "USG-Bulk-Enrollment-Template.csv");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadStudents() {
  busy(elements.refresh, true, "Loading…");
  clearStatus(elements.directoryStatus);
  try {
    students = await listStudents();
    renderStudents();
    setStatus(elements.directoryStatus, `${students.length} student account${students.length === 1 ? "" : "s"} loaded.`, "success");
  } catch (error) {
    setStatus(elements.directoryStatus, error.message, "error");
  } finally {
    busy(elements.refresh, false, "Refresh");
  }
}

function renderStudents() {
  const query = elements.search.value.trim().toLowerCase();
  const matches = students.filter((student) => `${profileDisplayName(student)} ${student.student_number}`.toLowerCase().includes(query));
  elements.body.innerHTML = matches.map((student) => {
    const profileComplete = Boolean(student.privacy_notice_accepted_at && student.photo_path);
    return `<tr><td><strong>${escapeHtml(profileDisplayName(student))}</strong><small>${escapeHtml(student.student_number)}</small></td><td>${escapeHtml(student.program)}</td><td><span class="status-tag ${student.account_status === "inactive" ? "status-tag--ended" : ""}">${escapeHtml(student.account_status)}</span><small>${student.must_change_password ? "Password change required" : "Password activated"}</small></td><td>${profileComplete ? "Complete" : "Incomplete"}</td><td><div class="account-actions"><button class="button button--quiet button--small" data-action="resetPassword" data-student="${escapeHtml(student.student_number)}" type="button">Reset password</button><button class="button ${student.account_status === "inactive" ? "button--secondary" : "button--danger"} button--small" data-action="${student.account_status === "inactive" ? "reactivate" : "deactivate"}" data-student="${escapeHtml(student.student_number)}" type="button">${student.account_status === "inactive" ? "Reactivate" : "Deactivate"}</button></div></td></tr>`;
  }).join("") || '<tr><td colspan="5">No students match the current search.</td></tr>';
}

async function handleStudentAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const number = button.dataset.student;
  const prompt = action === "resetPassword" ? `Reset the password for ${number}? The previous password will immediately stop working.` : `${action === "deactivate" ? "Deactivate" : "Reactivate"} ${number}?`;
  if (!window.confirm(prompt)) return;
  busy(button, true, "Working…");
  try {
    const result = await administerStudent({ action, studentNumber: number });
    if (result.temporaryPassword) showCredentials(result);
    await loadStudents();
  } catch (error) {
    setStatus(elements.directoryStatus, error.message, "error");
  } finally {
    busy(button, false, action === "resetPassword" ? "Reset password" : action === "deactivate" ? "Deactivate" : "Reactivate");
  }
}

function showCredentials(result) {
  currentCredentials = { username: result.username, password: result.temporaryPassword };
  elements.credentialUsername.textContent = result.username;
  elements.credentialPassword.textContent = result.temporaryPassword;
  elements.credentials.hidden = false;
  elements.credentials.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function copyCredentials() {
  if (!currentCredentials) return;
  const text = `PSU Balabac USG Attendance\nUsername: ${currentCredentials.username}\nTemporary password: ${currentCredentials.password}\nChange this password immediately after first login.`;
  try { await navigator.clipboard.writeText(text); elements.copyCredentials.textContent = "Copied"; setTimeout(() => { elements.copyCredentials.textContent = "Copy credentials"; }, 1500); }
  catch { window.prompt("Copy these temporary credentials:", text); }
}

function printCredentials() { if (currentCredentials) window.print(); }
function clearCredentials() { currentCredentials = null; elements.credentialUsername.textContent = ""; elements.credentialPassword.textContent = ""; elements.credentials.hidden = true; }
function busy(button, state, label) { button.disabled = state; button.textContent = label; }
