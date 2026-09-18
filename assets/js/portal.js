import { clearStatus, escapeHtml, setStatus } from "./common.js";
import { BALABAC_BARANGAYS, formatBalabacAddress, parseStoredAddress } from "./address.js?v=20260917.4";
import { renderStudentIdPair } from "./id-card.js?v=20260917.3";
import { captureIdCard, captureIdCardBlob } from "./id-export.js?v=20260917.3";
import { groupAttendanceSessions } from "./attendance-report.js?v=20260915.3";
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
} from "./supabase-client.js?v=20260915.7";

const elements = {
  login: document.querySelector("#student-login"), loginForm: document.querySelector("#student-login-form"), username: document.querySelector("#student-username"), password: document.querySelector("#student-password"), loginStatus: document.querySelector("#student-login-status"),
  passwordPanel: document.querySelector("#password-change"), passwordForm: document.querySelector("#password-change-form"), newPassword: document.querySelector("#new-password"), confirmPassword: document.querySelector("#confirm-password"), passwordStatus: document.querySelector("#password-change-status"),
  account: document.querySelector("#student-account"), logout: document.querySelector("#portal-logout"), name: document.querySelector("#account-student-name"), meta: document.querySelector("#account-student-meta"), accountStatus: document.querySelector("#account-status"),
  previewBanner: document.querySelector("#portal-preview-banner"),
  profileForm: document.querySelector("#student-profile-form"), birthDate: document.querySelector("#profile-birth-date"), address: document.querySelector("#profile-address"), addressMode: document.querySelector("#profile-address-mode"), guidedAddress: document.querySelector("#profile-balabac-address"), barangay: document.querySelector("#profile-address-barangay"), addressDetail: document.querySelector("#profile-address-detail"), manualAddressField: document.querySelector("#profile-manual-address-field"), manualAddress: document.querySelector("#profile-address-manual"), addressPreview: document.querySelector("#profile-address-preview strong"), phone: document.querySelector("#profile-phone"), emergencyName: document.querySelector("#profile-emergency-name"), emergencyPhone: document.querySelector("#profile-emergency-phone"), photo: document.querySelector("#profile-photo"), privacy: document.querySelector("#profile-privacy"), profileStatus: document.querySelector("#profile-status"),
  idPreview: document.querySelector("#portal-id-preview"), idFrontTab: document.querySelector("#show-id-front"), idBackTab: document.querySelector("#show-id-back"), idPosition: document.querySelector("#portal-id-position"), saveId: document.querySelector("#save-id-copy"), downloadFront: document.querySelector("#download-id-front"), downloadBack: document.querySelector("#download-id-back"), pdfId: document.querySelector("#download-id-pdf"), printId: document.querySelector("#print-id-pair"), idStatus: document.querySelector("#id-status"),
  reportBody: document.querySelector("#own-report-body"), reportEmpty: document.querySelector("#own-report-empty"), eventCount: document.querySelector("#own-event-count"), totalTime: document.querySelector("#own-total-time"), downloadReport: document.querySelector("#download-own-report"), reportStatus: document.querySelector("#own-report-status"),
};

let profile;
let photoUrl = "";
let idCards;
let idSlides = [];
let activeIdSide = "front";
let idPreviewLayoutKey = "";
let attendance = [];
const previewMode = new URLSearchParams(window.location.search).get("preview") === "interface";
const mobileIdPreview = window.matchMedia("(max-width: 680px)");

BALABAC_BARANGAYS.forEach((barangay) => elements.barangay.add(new Option(barangay, barangay)));
elements.addressMode.addEventListener("change", syncAddressEditor);
elements.barangay.addEventListener("change", syncAddressEditor);
elements.addressDetail.addEventListener("input", syncAddressEditor);
elements.manualAddress.addEventListener("input", syncAddressEditor);

elements.loginForm.addEventListener("submit", handleLogin);
elements.passwordForm.addEventListener("submit", handlePasswordChange);
elements.profileForm.addEventListener("submit", handleProfileSave);
elements.logout.addEventListener("click", () => logout());
elements.saveId.addEventListener("click", saveIdCopies);
elements.downloadFront.addEventListener("click", () => downloadIdSide("front"));
elements.downloadBack.addEventListener("click", () => downloadIdSide("back"));
elements.pdfId.addEventListener("click", downloadIdPdf);
elements.printId.addEventListener("click", printIdPair);
elements.downloadReport.addEventListener("click", downloadExcelReport);
elements.idFrontTab.addEventListener("click", () => showIdSide("front"));
elements.idBackTab.addEventListener("click", () => showIdSide("back"));
elements.idPreview.addEventListener("scroll", syncIdSideFromScroll, { passive: true });
elements.idPreview.addEventListener("keydown", handleIdPreviewKeydown);
mobileIdPreview.addEventListener?.("change", layoutIdPreview);
if ("ResizeObserver" in window) new ResizeObserver(layoutIdPreview).observe(elements.idPreview);
else window.addEventListener("resize", layoutIdPreview);

if (previewMode) openInterfacePreview();
else restoreAccount();

async function openInterfacePreview() {
  document.body.classList.add("portal-preview-mode");
  profile = {
    role: "student",
    account_status: "Interface preview",
    student_number: "2026-10-0000BL",
    first_name: "Sample",
    middle_name: "A",
    last_name: "Student",
    suffix: "",
    program: "BEEd",
    date_of_birth: "2005-01-15",
    address: "Purok 1, Barangay Poblacion VI, Balabac, Palawan",
    phone: "09XX XXX XXXX",
    emergency_contact_name: "Sample Contact Person",
    emergency_contact_phone: "09XX XXX XXXX",
    privacy_notice_accepted_at: new Date().toISOString(),
    photo_path: null,
  };
  elements.login.hidden = true;
  elements.passwordPanel.hidden = true;
  elements.logout.hidden = true;
  elements.account.hidden = false;
  elements.previewBanner.hidden = false;
  await renderAccount();
  elements.profileForm.querySelectorAll("input, select, textarea, button").forEach((control) => { control.disabled = true; });
  [elements.saveId, elements.downloadFront, elements.downloadBack, elements.pdfId, elements.printId, elements.downloadReport].forEach((button) => { button.disabled = true; });
}

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
  loadAddressEditor(profile.address || "");
  elements.phone.value = profile.phone || "";
  elements.emergencyName.value = profile.emergency_contact_name || "";
  elements.emergencyPhone.value = profile.emergency_contact_phone || "";
  elements.privacy.checked = Boolean(profile.privacy_notice_accepted_at);
  photoUrl = !previewMode && profile.photo_path ? await privateAssetUrl("student-photos", profile.photo_path) : "";
  idCards = renderStudentIdPair(elements.idPreview, profile, photoUrl);
  setupIdPreviewNavigation();
  if (previewMode) {
    attendance = [{
      event_name: "Sample USG Activity",
      venue: "PSU Balabac Campus",
      first_time_in: "2026-09-15T00:00:00.000Z",
      first_time_out: "2026-09-15T02:30:00.000Z",
      second_time_in: null,
      second_time_out: null,
      total_seconds: 9000,
    }];
    renderAttendance();
  } else {
    await loadAttendance();
  }
}

function setupIdPreviewNavigation() {
  idSlides = [
    createIdSlide("front", idCards.front),
    createIdSlide("back", idCards.back),
  ];
  elements.idPreview.replaceChildren(...idSlides);
  idPreviewLayoutKey = "";
  layoutIdPreview();
  requestAnimationFrame(() => showIdSide(activeIdSide, false));
}

function createIdSlide(side, card) {
  const slide = document.createElement("div");
  slide.className = "portal-id-slide";
  slide.id = `portal-id-slide-${side}`;
  slide.dataset.idSide = side;
  slide.setAttribute("role", "tabpanel");
  slide.setAttribute("aria-labelledby", side === "front" ? "show-id-front" : "show-id-back");
  slide.append(card);
  return slide;
}

function layoutIdPreview() {
  if (!idCards || !idSlides.length) return;
  const isMobile = mobileIdPreview.matches;
  const availableWidth = Math.max(0, elements.idPreview.clientWidth - 16);
  const layoutKey = `${isMobile}:${availableWidth}`;
  if (layoutKey === idPreviewLayoutKey) return;
  idPreviewLayoutKey = layoutKey;
  idSlides.forEach((slide) => {
    const card = slide.querySelector(".student-id");
    card.style.removeProperty("--id-preview-scale");
    slide.style.removeProperty("height");
    slide.setAttribute("aria-hidden", String(isMobile && slide.dataset.idSide !== activeIdSide));
    if (!isMobile || !availableWidth) return;
    const scale = Math.min(1, availableWidth / card.offsetWidth);
    card.style.setProperty("--id-preview-scale", String(scale));
    slide.style.height = `${Math.ceil(card.offsetHeight * scale) + 16}px`;
  });
  if (isMobile) requestAnimationFrame(() => scrollToIdSide(activeIdSide, false));
  else elements.idPreview.scrollLeft = 0;
}

function showIdSide(side, smooth = true) {
  updateIdSideState(side);
  scrollToIdSide(activeIdSide, smooth);
}

function updateIdSideState(side) {
  activeIdSide = side === "back" ? "back" : "front";
  elements.idFrontTab.classList.toggle("is-active", activeIdSide === "front");
  elements.idBackTab.classList.toggle("is-active", activeIdSide === "back");
  elements.idFrontTab.setAttribute("aria-selected", String(activeIdSide === "front"));
  elements.idBackTab.setAttribute("aria-selected", String(activeIdSide === "back"));
  elements.idPosition.textContent = activeIdSide === "front" ? "Front · 1 of 2" : "Back · 2 of 2";
  idSlides.forEach((slide) => slide.setAttribute("aria-hidden", String(mobileIdPreview.matches && slide.dataset.idSide !== activeIdSide)));
}

function scrollToIdSide(side, smooth = true) {
  if (!mobileIdPreview.matches || !idSlides.length) return;
  const slide = idSlides[side === "back" ? 1 : 0];
  elements.idPreview.scrollTo({ left: slide.offsetLeft, behavior: smooth ? "smooth" : "auto" });
}

let idScrollFrame = 0;
function syncIdSideFromScroll() {
  if (!mobileIdPreview.matches || idScrollFrame || !idSlides.length) return;
  idScrollFrame = requestAnimationFrame(() => {
    idScrollFrame = 0;
    const distances = idSlides.map((slide) => Math.abs(slide.offsetLeft - elements.idPreview.scrollLeft));
    updateIdSideState(distances[1] < distances[0] ? "back" : "front");
  });
}

function handleIdPreviewKeydown(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  showIdSide(event.key === "ArrowRight" ? "back" : "front");
}

async function handleProfileSave(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Saving profile…");
  clearStatus(elements.profileStatus);
  try {
    if (elements.photo.files?.[0]) profile = await uploadStudentPhoto(elements.photo.files[0]);
    syncAddressEditor();
    if (!elements.address.value) {
      const target = elements.addressMode.value === "manual" ? elements.manualAddress : elements.barangay;
      target.focus();
      throw new Error(elements.addressMode.value === "manual" ? "Enter the complete address." : "Choose the student's barangay.");
    }
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

function loadAddressEditor(value) {
  const parsed = parseStoredAddress(value);
  elements.addressMode.value = parsed.mode;
  elements.barangay.value = parsed.barangay;
  elements.addressDetail.value = parsed.detail;
  elements.manualAddress.value = parsed.manual;
  syncAddressEditor();
}

function syncAddressEditor() {
  const isManual = elements.addressMode.value === "manual";
  elements.guidedAddress.hidden = isManual;
  elements.manualAddressField.hidden = !isManual;
  elements.barangay.required = !isManual;
  elements.manualAddress.required = isManual;
  const address = isManual
    ? elements.manualAddress.value.replace(/\s+/g, " ").trim()
    : formatBalabacAddress({ detail: elements.addressDetail.value, barangay: elements.barangay.value });
  elements.address.value = address;
  elements.addressPreview.textContent = address || (isManual ? "Enter the complete address to preview it." : "Select a barangay to preview the correctly formatted address.");
}

async function saveIdCopies() {
  if (!idCards) return;
  setBusy(elements.saveId, true, "Saving…");
  clearStatus(elements.idStatus);
  try {
    const [front, back] = await Promise.all([captureIdCardBlob(idCards.front), captureIdCardBlob(idCards.back)]);
    await saveStudentIdCopy("front", front);
    await saveStudentIdCopy("back", back);
    setStatus(elements.idStatus, "A private copy of both ID sides was saved to your account.", "success");
  } catch (error) {
    setStatus(elements.idStatus, error.message, "error");
  } finally {
    setBusy(elements.saveId, false, "Save ID copy");
  }
}

async function downloadIdSide(side) {
  if (!idCards?.[side]) return;
  const button = side === "front" ? elements.downloadFront : elements.downloadBack;
  const originalLabel = side === "front" ? "Download front PNG" : "Download back PNG";
  setBusy(button, true, "Preparing PNG…");
  clearStatus(elements.idStatus);
  try {
    const image = await captureIdCardBlob(idCards[side]);
    downloadBlob(image, `PSU-USG-ID-${profile.student_number}-${side.toUpperCase()}.png`);
    setStatus(elements.idStatus, `${side === "front" ? "Front" : "Back"} ID downloaded as a full-quality PNG.`, "success");
  } catch (error) {
    setStatus(elements.idStatus, error.message, "error");
  } finally {
    setBusy(button, false, originalLabel);
  }
}

async function downloadIdPdf() {
  if (!idCards) return;
  setBusy(elements.pdfId, true, "Generating A4 PDF…");
  clearStatus(elements.idStatus);
  try {
    const JsPdf = window.jspdf?.jsPDF;
    if (!JsPdf) throw new Error("The PDF export library did not load. Refresh the page and try again.");
    const [frontCanvas, backCanvas] = await Promise.all([captureIdCard(idCards.front), captureIdCard(idCards.back)]);
    const pdf = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const quadrantWidth = 105;
    const quadrantHeight = 148.5;

    // Cartesian-style placement: front in Q2 (upper-left), back in Q1 (upper-right).
    pdf.addImage(frontCanvas, "PNG", 0, 0, quadrantWidth, quadrantHeight, "id-front", "FAST");
    pdf.addImage(backCanvas, "PNG", quadrantWidth, 0, quadrantWidth, quadrantHeight, "id-back", "FAST");

    // Light guides divide the A4 sheet into four equal cutting quadrants.
    pdf.setDrawColor(185, 194, 201);
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(quadrantWidth, 0, quadrantWidth, 297);
    pdf.line(0, quadrantHeight, 210, quadrantHeight);
    pdf.setProperties({
      title: `PSU Balabac USG Attendance ID - ${profile.student_number}`,
      subject: "Front and back A6 attendance ID on an A4 sheet",
      author: "PSU Balabac Campus - University Student Government",
    });
    pdf.save(`PSU-USG-ID-${profile.student_number}-A4.pdf`);
    setStatus(elements.idStatus, "A4 PDF generated: front in Q2, back in Q1, with two blank lower quadrants.", "success");
  } catch (error) {
    setStatus(elements.idStatus, error.message, "error");
  } finally {
    setBusy(elements.pdfId, false, "Generate A4 PDF");
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
    attendance = groupAttendanceSessions(await ownAttendanceReport());
    renderAttendance();
  } catch (error) {
    setStatus(elements.reportStatus, error.message, "error");
  }
}

function renderAttendance() {
  const seconds = attendance.reduce((sum, row) => sum + Number(row.total_seconds || 0), 0);
  elements.eventCount.textContent = String(attendance.length);
  elements.totalTime.textContent = duration(seconds);
  elements.reportEmpty.hidden = attendance.length > 0;
  elements.reportBody.innerHTML = attendance.map((row) => `<tr><td data-label="Activity"><strong>${escapeHtml(row.event_name)}</strong><small>${escapeHtml(row.venue || "No venue")}</small></td><td data-label="Date">${escapeHtml(date(row.first_time_in))}</td><td data-label="First In">${escapeHtml(time(row.first_time_in))}</td><td data-label="First Out">${escapeHtml(time(row.first_time_out))}</td><td data-label="Second In">${escapeHtml(time(row.second_time_in))}</td><td data-label="Second Out">${escapeHtml(time(row.second_time_out))}</td><td data-label="Total">${duration(row.total_seconds)}</td></tr>`).join("");
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
  sheet.addRow(["Activity", "Venue", "Date", "First Time In", "First Time Out", "Second Time In", "Second Time Out", "Total Time"]);
  attendance.forEach((row) => sheet.addRow([row.event_name, row.venue || "", date(row.first_time_in), time(row.first_time_in), time(row.first_time_out), time(row.second_time_in), time(row.second_time_out), duration(row.total_seconds)]));
  sheet.columns = [{ width: 32 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
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
