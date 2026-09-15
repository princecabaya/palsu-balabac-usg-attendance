import { clearStatus, escapeHtml, setStatus } from "./common.js";
import { renderStudentIdPair } from "./id-card.js";
import {
  changeStudentPassword,
  getOwnProfile,
  getSession,
  ownAttendanceReport,
  privateAssetUrl,
  profileDisplayName,
  saveStudentIdCopy,
  signInStudent,
  signOut,
  updateStudentProfile,
  uploadStudentPhoto,
} from "./supabase-client.js";

const elements = {
  login: document.querySelector("#student-login"), loginForm: document.querySelector("#student-login-form"), username: document.querySelector("#student-username"), password: document.querySelector("#student-password"), loginStatus: document.querySelector("#student-login-status"),
  passwordPanel: document.querySelector("#password-change"), passwordForm: document.querySelector("#password-change-form"), newPassword: document.querySelector("#new-password"), confirmPassword: document.querySelector("#confirm-password"), passwordStatus: document.querySelector("#password-change-status"),
  account: document.querySelector("#student-account"), logout: document.querySelector("#portal-logout"), name: document.querySelector("#account-student-name"), meta: document.querySelector("#account-student-meta"), accountStatus: document.querySelector("#account-status"),
  profileForm: document.querySelector("#student-profile-form"), birthDate: document.querySelector("#profile-birth-date"), address: document.querySelector("#profile-address"), phone: document.querySelector("#profile-phone"), emergencyName: document.querySelector("#profile-emergency-name"), emergencyPhone: document.querySelector("#profile-emergency-phone"), photo: document.querySelector("#profile-photo"), privacy: document.querySelector("#profile-privacy"), profileStatus: document.querySelector("#profile-status"),
  idPreview: document.querySelector("#portal-id-preview"), saveId: document.querySelector("#save-id-copy"), downloadId: document.querySelector("#download-id-pair"), printId: document.querySelector("#print-id-pair"), idStatus: document.querySelector("#id-status"),
  reportBody: document.querySelector("#own-report-body"), reportEmpty: document.querySelector("#own-report-empty"), eventCount: document.querySelector("#own-event-count"), totalTime: document.querySelector("#own-total-time"), downloadReport: document.querySelector("#download-own-report"), reportStatus: document.querySelector("#own-report-status"),
};

let profile;
let photoUrl = "";
let idCards;
let attendance = [];

elements.loginForm.addEventListener("submit", handleLogin);
elements.passwordForm.addEventListener("submit", handlePasswordChange);
elements.profileForm.addEventListener("submit", handleProfileSave);
elements.logout.addEventListener("click", () => logout());
elements.saveId.addEventListener("click", saveIdCopies);
elements.downloadId.addEventListener("click", downloadIdPair);
elements.printId.addEventListener("click", printIdPair);
elements.downloadReport.addEventListener("click", downloadExcelReport);

restoreAccount();

async function restoreAccount() {
  try {
    if (await getSession()) await openAccount();
  } catch (error) {
    setStatus(elements.loginStatus, error.message, "error");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Signing in…");
  clearStatus(elements.loginStatus);
  try {
    await signInStudent(elements.username.value, elements.password.value);
    elements.password.value = "";
    await openAccount();
  } catch (error) {
    setStatus(elements.loginStatus, error.message, "error");
  } finally {
    setBusy(button, false, "Sign in");
  }
}

async function openAccount() {
  profile = await getOwnProfile();
  if (profile.role !== "student") throw new Error("This page is only for student accounts.");
  elements.login.hidden = true;
  elements.logout.hidden = false;
  if (profile.must_change_password) {
    elements.passwordPanel.hidden = false;
    elements.account.hidden = true;
    elements.newPassword.focus();
    return;
  }
  elements.passwordPanel.hidden = true;
  elements.account.hidden = false;
  await renderAccount();
}

async function handlePasswordChange(event) {
  event.preventDefault();
  clearStatus(elements.passwordStatus);
  if (elements.newPassword.value !== elements.confirmPassword.value) {
    setStatus(elements.passwordStatus, "The two passwords do not match.", "error");
    return;
  }
  const button = event.submitter;
  setBusy(button, true, "Changing password…");
  try {
    await changeStudentPassword(elements.newPassword.value);
    elements.passwordForm.reset();
    setStatus(elements.passwordStatus, "Your account is active and the temporary password has been replaced.", "success");
    await openAccount();
  } catch (error) {
    setStatus(elements.passwordStatus, error.message, "error");
  } finally {
    setBusy(button, false, "Change password and activate account");
  }
}

async function renderAccount() {
  elements.name.textContent = profileDisplayName(profile);
  elements.meta.textContent = `${profile.student_number} · ${profile.program}`;
  elements.accountStatus.textContent = profile.account_status;
  elements.birthDate.value = profile.date_of_birth || "";
  elements.address.value = profile.address || "";
  elements.phone.value = profile.phone || "";
  elements.emergencyName.value = profile.emergency_contact_name || "";
  elements.emergencyPhone.value = profile.emergency_contact_phone || "";
  elements.privacy.checked = Boolean(profile.privacy_notice_accepted_at);
  photoUrl = profile.photo_path ? await privateAssetUrl("student-photos", profile.photo_path) : "";
  idCards = renderStudentIdPair(elements.idPreview, profile, photoUrl);
  await loadAttendance();
}

async function handleProfileSave(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Saving profile…");
  clearStatus(elements.profileStatus);
  try {
    if (elements.photo.files?.[0]) profile = await uploadStudentPhoto(elements.photo.files[0]);
    profile = await updateStudentProfile({
      dateOfBirth: elements.birthDate.value,
      address: elements.address.value,
      phone: elements.phone.value,
      emergencyContactName: elements.emergencyName.value,
      emergencyContactPhone: elements.emergencyPhone.value,
      acceptPrivacy: elements.privacy.checked,
    });
    elements.photo.value = "";
    await renderAccount();
    setStatus(elements.profileStatus, "Profile saved. Review the front and back of your ID below.", "success");
  } catch (error) {
    setStatus(elements.profileStatus, error.message, "error");
  } finally {
    setBusy(button, false, "Save profile");
  }
}

async function cardBlob(card) {
  if (!window.html2canvas) throw new Error("The ID export library did not load.");
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = await window.html2canvas(card, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The ID image could not be created.")), "image/png"));
}

async function saveIdCopies() {
  if (!idCards) return;
  setBusy(elements.saveId, true, "Saving…");
  clearStatus(elements.idStatus);
  try {
    const [front, back] = await Promise.all([cardBlob(idCards.front), cardBlob(idCards.back)]);
    await saveStudentIdCopy("front", front);
    await saveStudentIdCopy("back", back);
    setStatus(elements.idStatus, "A private copy of both ID sides was saved to your account.", "success");
  } catch (error) {
    setStatus(elements.idStatus, error.message, "error");
  } finally {
    setBusy(elements.saveId, false, "Save ID copy");
  }
}

async function downloadIdPair() {
  if (!idCards || !window.JSZip) return;
  setBusy(elements.downloadId, true, "Preparing…");
  clearStatus(elements.idStatus);
  try {
    const zip = new window.JSZip();
    const [front, back] = await Promise.all([cardBlob(idCards.front), cardBlob(idCards.back)]);
    zip.file(`PSU-USG-ID-${profile.student_number}-FRONT.png`, front);
    zip.file(`PSU-USG-ID-${profile.student_number}-BACK.png`, back);
    const archive = await zip.generateAsync({ type: "blob" });
    downloadBlob(archive, `PSU-USG-ID-${profile.student_number}.zip`);
  } catch (error) {
    setStatus(elements.idStatus, error.message, "error");
  } finally {
    setBusy(elements.downloadId, false, "Download front & back");
  }
}

function printIdPair() {
  document.body.classList.add("printing-id-pair");
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-id-pair"), { once: true });
  window.print();
}

async function loadAttendance() {
  clearStatus(elements.reportStatus);
  try {
    attendance = await ownAttendanceReport();
    const seconds = attendance.reduce((sum, row) => sum + Number(row.total_seconds || 0), 0);
    elements.eventCount.textContent = String(attendance.length);
    elements.totalTime.textContent = duration(seconds);
    elements.reportEmpty.hidden = attendance.length > 0;
    elements.reportBody.innerHTML = attendance.map((row) => `<tr><td data-label="Activity"><strong>${escapeHtml(row.event_name)}</strong><small>${escapeHtml(row.venue || "No venue")}</small></td><td data-label="Date">${escapeHtml(date(row.time_in))}</td><td data-label="Time In">${escapeHtml(time(row.time_in))}</td><td data-label="Time Out">${escapeHtml(time(row.time_out))}</td><td data-label="Total">${duration(row.total_seconds)}</td></tr>`).join("");
  } catch (error) {
    setStatus(elements.reportStatus, error.message, "error");
  }
}

async function downloadExcelReport() {
  if (!window.ExcelJS) {
    setStatus(elements.reportStatus, "The Excel export library did not load. Refresh the page.", "error");
    return;
  }
  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = "PSU Balabac USG Attendance";
  const sheet = workbook.addWorksheet("Attendance Report");
  sheet.addRow(["PALAWAN STATE UNIVERSITY – BALABAC CAMPUS"]);
  sheet.addRow(["USG STUDENT ATTENDANCE REPORT"]);
  sheet.addRow(["Student", profileDisplayName(profile)]);
  sheet.addRow(["Student Number", profile.student_number]);
  sheet.addRow(["Program", profile.program]);
  sheet.addRow([]);
  sheet.addRow(["Activity", "Venue", "Date", "Time In", "Time Out", "Total Time", "Offline Entry"]);
  attendance.forEach((row) => sheet.addRow([row.event_name, row.venue || "", date(row.time_in), time(row.time_in), time(row.time_out), duration(row.total_seconds), row.time_in_offline || row.time_out_offline ? "Yes" : "No"]));
  sheet.columns = [{ width: 32 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }];
  sheet.getRow(2).font = { bold: true, size: 14 };
  sheet.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF47A31" } };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `USG-Attendance-${profile.student_number}.xlsx`);
}

async function logout() {
  await signOut();
  profile = null;
  elements.account.hidden = true;
  elements.passwordPanel.hidden = true;
  elements.logout.hidden = true;
  elements.login.hidden = false;
  elements.username.focus();
}

function date(value) { return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value)) : "—"; }
function time(value) { return value ? new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila" }).format(new Date(value)) : "—"; }
function duration(value) { const total = Math.max(0, Number(value) || 0); return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), Math.floor(total % 60)].map((part) => String(part).padStart(2, "0")).join(":"); }
function setBusy(button, busy, label) { button.disabled = busy; button.textContent = label; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
