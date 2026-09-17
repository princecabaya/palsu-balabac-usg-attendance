import { buildQrPayload, programLabel } from "./qr-payload.js";
import { profileDisplayName } from "./supabase-client.js?v=20260915.7";

export function renderStudentIdPair(container, profile, photoUrl = "") {
  const name = profileDisplayName(profile).toUpperCase();
  const front = document.createElement("article");
  front.className = "student-id student-id--front";
  front.dataset.idSide = "front";
  front.innerHTML = `
    <img class="id-card-background" src="assets/img/id-card-art.svg" alt="" aria-hidden="true">
    <header class="id-header">
      <img src="assets/img/psu-logo.png" alt="">
      <div><strong>PALAWAN STATE UNIVERSITY</strong><small>BALABAC CAMPUS · USG</small><span>STUDENT ATTENDANCE ID</span></div>
      <img src="assets/img/usg-logo.png" alt="">
    </header>
    <div class="id-media-row">
      <div class="id-media-card"><div class="id-photo">${photoUrl ? `<img src="${escapeAttribute(photoUrl)}" crossorigin="anonymous" alt="2×2 photo of ${escapeAttribute(name)}">` : "2×2 ID<br>PHOTO"}</div><span>STUDENT PHOTO</span></div>
      <div class="id-media-card"><div class="id-qr" aria-label="Attendance QR code"></div><span>ATTENDANCE QR</span></div>
    </div>
    <div class="id-details"><h3>${escapeHtml(name)}</h3><p class="student-number">${escapeHtml(profile.student_number)}</p><p class="program-name">${escapeHtml(programLabel(profile.program))}</p></div>
    <div class="id-signature"><span></span><small>STUDENT'S SIGNATURE</small></div>
    <p class="id-attendance"><strong>USG ATTENDANCE</strong><span>Not an official university ID.</span></p>`;

  const back = document.createElement("article");
  back.className = "student-id student-id--back";
  back.dataset.idSide = "back";
  back.setAttribute("aria-label", `Back of attendance ID for ${name}`);
  back.innerHTML = `
    <img class="id-card-background" src="assets/img/id-card-art.svg" alt="" aria-hidden="true">
    <section class="id-back-details">
      ${backRow("Student number", profile.student_number)}
      ${backRow("Date of birth", formatBirthDate(profile.date_of_birth))}
      ${backRow("Address", profile.address)}
      ${backRow("Phone number", profile.phone)}
      <div class="id-back-divider">IN CASE OF EMERGENCY</div>
      ${backRow("Contact person", profile.emergency_contact_name)}
      ${backRow("Contact number", profile.emergency_contact_phone)}
    </section>
    <footer class="id-back-footer"><strong>Kindly return this ID to the owner if found.</strong><span>This is an unofficial ID. Still wear your valid PalSU ID.</span></footer>`;

  container.replaceChildren(front, back);
  if (!window.QRCode) throw new Error("The QR generator did not load. Refresh the page.");
  new window.QRCode(front.querySelector(".id-qr"), {
    text: buildQrPayload({ studentNumber: profile.student_number }),
    width: 256,
    height: 256,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.M,
  });
  return { front, back };
}

function backRow(label, value) {
  return `<div class="id-back-row"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || "Not provided")}</strong></div>`;
}

function formatBirthDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function escapeAttribute(value = "") {
  return escapeHtml(value);
}
