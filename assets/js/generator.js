import { adminLogin, getAdminSession, jsonp } from "./api.js";
import { clearStatus, escapeHtml, setStatus } from "./common.js";
import { buildQrPayload, normalizeProgram, programLabel } from "./qr-payload.js";

const elements = {
  login: document.querySelector("#generator-login"),
  loginForm: document.querySelector("#generator-login-form"),
  loginStatus: document.querySelector("#generator-login-status"),
  tools: document.querySelector("#generator-tools"),
  refresh: document.querySelector("#refresh-roster"),
  search: document.querySelector("#student-search"),
  program: document.querySelector("#program-filter"),
  photo: document.querySelector("#student-photo"),
  selectVisible: document.querySelector("#select-visible"),
  selectionCount: document.querySelector("#selection-count"),
  generate: document.querySelector("#generate-cards"),
  print: document.querySelector("#print-cards"),
  download: document.querySelector("#download-cards"),
  rosterBody: document.querySelector("#roster-body"),
  status: document.querySelector("#generator-status"),
  idGrid: document.querySelector("#id-grid"),
  empty: document.querySelector("#card-empty"),
};

let adminSession = getAdminSession();
let students = [];
let filteredStudents = [];
let selected = new Set();
let photoUrl = "";

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Signing in…";
  clearStatus(elements.loginStatus);
  try {
    adminSession = await adminLogin(document.querySelector("#generator-password").value);
    await openGenerator();
  } catch (error) {
    setStatus(elements.loginStatus, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Open roster";
  }
});

elements.refresh.addEventListener("click", loadRoster);
elements.search.addEventListener("input", applyFilters);
elements.program.addEventListener("change", applyFilters);
elements.selectVisible.addEventListener("change", () => {
  filteredStudents.forEach((student) => elements.selectVisible.checked ? selected.add(student.studentNumber) : selected.delete(student.studentNumber));
  renderRoster();
  updateSelection();
});
elements.rosterBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-student]");
  if (!checkbox) return;
  checkbox.checked ? selected.add(checkbox.dataset.student) : selected.delete(checkbox.dataset.student);
  updateSelection();
});
elements.photo.addEventListener("change", () => {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  const file = elements.photo.files?.[0];
  photoUrl = file ? URL.createObjectURL(file) : "";
});
elements.generate.addEventListener("click", generateCards);
elements.print.addEventListener("click", () => window.print());
elements.download.addEventListener("click", downloadAllCards);

if (adminSession) openGenerator();

async function openGenerator() {
  elements.login.hidden = true;
  elements.tools.hidden = false;
  await loadRoster();
}

async function loadRoster() {
  clearStatus(elements.status);
  elements.refresh.disabled = true;
  elements.refresh.textContent = "Loading…";
  try {
    const response = await jsonp("students", { token: adminSession.token });
    students = response.students.map((student) => ({ ...student, program: normalizeProgram(student.program) }));
    applyFilters();
    setStatus(elements.status, `${students.length} students loaded from the USG Attendance Sheet.`, "success");
  } catch (error) {
    setStatus(elements.status, error.message, "error");
    if (error.code === "SESSION_EXPIRED") {
      elements.login.hidden = false;
      elements.tools.hidden = true;
    }
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.textContent = "Refresh roster";
  }
}

function applyFilters() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  const program = elements.program.value;
  filteredStudents = students.filter((student) => {
    const matchesQuery = !query || `${student.name} ${student.studentNumber}`.toLocaleLowerCase().includes(query);
    return matchesQuery && (!program || student.program === program);
  });
  renderRoster();
}

function renderRoster() {
  elements.rosterBody.innerHTML = filteredStudents.map((student) => `
    <tr>
      <td><input type="checkbox" data-student="${escapeHtml(student.studentNumber)}" aria-label="Select ${escapeHtml(student.name)}" ${selected.has(student.studentNumber) ? "checked" : ""}></td>
      <td><strong>${escapeHtml(student.name)}</strong></td>
      <td>${escapeHtml(student.studentNumber)}</td>
      <td>${escapeHtml(student.program)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">No students match the current filter.</td></tr>`;
  elements.selectVisible.checked = filteredStudents.length > 0 && filteredStudents.every((student) => selected.has(student.studentNumber));
  updateSelection();
}

function updateSelection() {
  const count = selected.size;
  elements.selectionCount.textContent = `${count} selected`;
  elements.generate.disabled = count === 0;
}

function generateCards() {
  clearStatus(elements.status);
  const selectedStudents = students.filter((student) => selected.has(student.studentNumber));
  if (!selectedStudents.length) return;
  if (photoUrl && selectedStudents.length !== 1) {
    setStatus(elements.status, "A photo can be applied only when one student is selected. The batch will use blank 2×2 photo spaces.", "info");
  }

  elements.idGrid.innerHTML = "";
  let currentSheet;
  selectedStudents.forEach((student, index) => {
    if (index % 4 === 0) {
      currentSheet = document.createElement("section");
      currentSheet.className = "id-sheet";
      currentSheet.setAttribute("aria-label", `A4 ID sheet ${Math.floor(index / 4) + 1}`);
      elements.idGrid.appendChild(currentSheet);
    }
    const card = createCard(student, selectedStudents.length === 1 ? photoUrl : "");
    currentSheet.appendChild(card);
    new QRCode(card.querySelector(".id-qr"), {
      text: buildQrPayload(student),
      width: 256,
      height: 256,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
    card.dataset.cardIndex = index;
    card.dataset.studentNumber = student.studentNumber;
  });
  elements.empty.hidden = true;
  elements.print.disabled = false;
  elements.download.hidden = false;
  setDownloadLabel(selectedStudents.length);
  elements.idGrid.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createCard(student, picture) {
  const card = document.createElement("article");
  card.className = "student-id";
  card.setAttribute("aria-label", `QR ID for ${student.name}`);
  card.innerHTML = `
    <header class="id-header">
      <img src="assets/img/psu-logo.png" alt="">
      <div><strong>PALAWAN STATE UNIVERSITY</strong><small>BALABAC CAMPUS · USG</small><span>STUDENT ATTENDANCE ID</span></div>
      <img src="assets/img/usg-logo.png" alt="">
    </header>
    <div class="id-media-row">
      <div class="id-media-card">
        <div class="id-photo">${picture ? `<img src="${picture}" alt="2×2 photo of ${escapeHtml(student.name)}">` : "2×2 ID<br>PHOTO"}</div>
        <span>STUDENT PHOTO</span>
      </div>
      <div class="id-media-card">
        <div class="id-qr" aria-label="Attendance QR code"></div>
        <span>ATTENDANCE QR</span>
      </div>
    </div>
    <div class="id-details">
      <h3>${escapeHtml(student.name)}</h3>
      <p class="student-number">${escapeHtml(student.studentNumber)}</p>
      <p class="program-name">${escapeHtml(programLabel(student.program))}</p>
    </div>
    <div class="id-signature" aria-label="Blank for student's signature">
      <span></span>
      <small>STUDENT'S SIGNATURE</small>
    </div>
    <p class="id-attendance"><strong>USG ATTENDANCE</strong><span>Present to the assigned checker.</span></p>
  `;
  return card;
}

async function downloadAllCards() {
  const cards = [...elements.idGrid.querySelectorAll(".student-id")];
  if (!cards.length) return;
  elements.download.disabled = true;
  clearStatus(elements.status);
  try {
    if (!window.html2canvas || !window.JSZip) {
      throw new Error("The ZIP export libraries did not load. Refresh the page and try again, or use Print 4 IDs per A4.");
    }
    if (document.fonts?.ready) await document.fonts.ready;

    const zip = new JSZip();
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      elements.download.textContent = `Preparing ${index + 1} of ${cards.length}…`;
      const canvas = await html2canvas(card, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
      const image = await canvasToBlob(canvas);
      const studentNumber = safeFilenamePart(card.dataset.studentNumber || `student-${index + 1}`);
      zip.file(`PSU-USG-A6-ID-${studentNumber}.png`, image);
    }

    const archive = await zip.generateAsync({ type: "blob" }, ({ percent }) => {
      elements.download.textContent = `Creating ZIP ${Math.round(percent)}%`;
    });
    const url = URL.createObjectURL(archive);
    const link = document.createElement("a");
    link.download = `PSU-USG-A6-IDs-${new Date().toISOString().slice(0, 10)}.zip`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(elements.status, `${cards.length} A6 ID${cards.length === 1 ? "" : "s"} downloaded in one ZIP file.`, "success");
  } catch (error) {
    setStatus(elements.status, error.message, "error");
  } finally {
    elements.download.disabled = false;
    setDownloadLabel(cards.length);
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("An ID image could not be created.")), "image/png");
  });
}

function safeFilenamePart(value) {
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "student";
}

function setDownloadLabel(count) {
  elements.download.textContent = `Download all ${count} ID${count === 1 ? "" : "s"} as ZIP`;
}
