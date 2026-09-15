import { clearStatus, escapeHtml, setStatus } from "./common.js";
import { administerStudent, getOwnProfile, getSession, listStudents, normalizeStudentNumber, profileDisplayName, signInAdmin, signOut } from "./supabase-client.js";

const elements = {
  login: document.querySelector("#student-admin-login"), loginForm: document.querySelector("#student-admin-login-form"), email: document.querySelector("#student-admin-email"), password: document.querySelector("#student-admin-password"), loginStatus: document.querySelector("#student-admin-login-status"), logout: document.querySelector("#student-admin-logout"), content: document.querySelector("#student-admin-content"),
  form: document.querySelector("#enrollment-form"), number: document.querySelector("#enroll-student-number"), firstName: document.querySelector("#enroll-first-name"), middleName: document.querySelector("#enroll-middle-name"), lastName: document.querySelector("#enroll-last-name"), suffix: document.querySelector("#enroll-suffix"), program: document.querySelector("#enroll-program"), enrollmentStatus: document.querySelector("#enrollment-status"),
  credentials: document.querySelector("#credential-panel"), credentialUsername: document.querySelector("#credential-username"), credentialPassword: document.querySelector("#credential-password"), copyCredentials: document.querySelector("#copy-credentials"), printCredentials: document.querySelector("#print-credentials"), clearCredentials: document.querySelector("#clear-credentials"),
  search: document.querySelector("#student-directory-search"), refresh: document.querySelector("#refresh-students"), body: document.querySelector("#student-directory-body"), directoryStatus: document.querySelector("#student-directory-status"),
};

let students = [];
let currentCredentials = null;
elements.loginForm.addEventListener("submit", login);
elements.logout.addEventListener("click", logout);
elements.form.addEventListener("submit", enroll);
elements.refresh.addEventListener("click", loadStudents);
elements.search.addEventListener("input", renderStudents);
elements.body.addEventListener("click", handleStudentAction);
elements.copyCredentials.addEventListener("click", copyCredentials);
elements.printCredentials.addEventListener("click", printCredentials);
elements.clearCredentials.addEventListener("click", clearCredentials);
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
