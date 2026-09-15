import { clearStatus, escapeHtml, setStatus } from "./common.js";
import { renderStudentIdPair } from "./id-card.js?v=20260915.7";
import { normalizeProgram } from "./qr-payload.js";
import { getOwnProfile, getSession, listStudents, privateAssetUrls, profileDisplayName, signInAdmin, signOut } from "./supabase-client.js?v=20260915.7";

const elements = {
  login: document.querySelector("#generator-login"),
  loginForm: document.querySelector("#generator-login-form"),
  email: document.querySelector("#generator-admin-email"),
  password: document.querySelector("#generator-password"),
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
  logout: document.querySelector("#generator-logout"),
};

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
    await signInAdmin(elements.password.value, elements.email.value.trim());
    elements.password.value = "";
    await openGenerator();
  } catch (error) {
    setStatus(elements.loginStatus, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Open roster";
  }
});

elements.refresh.addEventListener("click", loadRoster);
elements.logout.addEventListener("click", logout);
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

restore();

async function restore() {
  try {
    if (!await getSession()) return;
    const profile = await getOwnProfile();
    if (profile.role === "admin" && profile.account_status === "active") await openGenerator();
  } catch { /* Keep the administrator sign-in form visible. */ }
}

async function openGenerator() {
  elements.login.hidden = true;
  elements.tools.hidden = false;
  elements.logout.hidden = false;
  await loadRoster();
}

async function logout() {
  await signOut();
  students = [];
  filteredStudents = [];
  selected.clear();
  elements.tools.hidden = true;
  elements.logout.hidden = true;
  elements.login.hidden = false;
  elements.rosterBody.innerHTML = "";
  elements.email.focus();
}

async function loadRoster() {
  clearStatus(elements.status);
  elements.refresh.disabled = true;
  elements.refresh.textContent = "Loading…";
  try {
    const profiles = await listStudents();
    students = profiles
      .filter((profile) => profile.account_status !== "inactive")
      .map((profile) => ({ ...profile,
        studentNumber: profile.student_number,
        name: profileDisplayName(profile),
        program: normalizeProgram(profile.program),
      }));
    applyFilters();
    setStatus(elements.status, `${students.length} students loaded from the secure Supabase directory.`, "success");
  } catch (error) {
    setStatus(elements.status, error.message, "error");
    if (error.code === "SESSION_EXPIRED") {
      elements.login.hidden = false;
      elements.tools.hidden = true;
      elements.logout.hidden = true;
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

async function generateCards() {
  clearStatus(elements.status);
  const selectedStudents = students.filter((student) => selected.has(student.studentNumber));
  if (!selectedStudents.length) return;
  if (photoUrl && selectedStudents.length !== 1) {
    setStatus(elements.status, "A photo can be applied only when one student is selected. The batch will use blank 2×2 photo spaces.", "info");
  }

  elements.generate.disabled = true;
  elements.generate.textContent = "Loading ID details…";
  try {
    const savedPhotos = await privateAssetUrls("student-photos", selectedStudents.map((student) => student.photo_path));
    elements.idGrid.innerHTML = "";
    let currentSheet;
    selectedStudents.forEach((student, index) => {
      if (index % 2 === 0) {
        currentSheet = document.createElement("section");
        currentSheet.className = "id-sheet";
        currentSheet.setAttribute("aria-label", `A4 ID sheet ${Math.floor(index / 2) + 1}`);
        elements.idGrid.appendChild(currentSheet);
      }
      const pair = document.createElement("div");
      pair.className = "id-pair";
      currentSheet.appendChild(pair);
      const picture = selectedStudents.length === 1 && photoUrl ? photoUrl : savedPhotos.get(student.photo_path) || "";
      const cards = renderStudentIdPair(pair, student, picture);
      Object.values(cards).forEach((card) => {
        card.dataset.studentNumber = student.studentNumber;
        card.dataset.cardIndex = index;
      });
    });
    elements.empty.hidden = true;
    elements.print.disabled = false;
    elements.download.hidden = false;
    setDownloadLabel(selectedStudents.length);
    setStatus(elements.status, `${selectedStudents.length} front-and-back ID${selectedStudents.length === 1 ? "" : "s"} generated using saved student profile details.`, "success");
    elements.idGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(elements.status, error.message, "error");
  } finally {
    elements.generate.textContent = "Generate IDs";
    updateSelection();
  }
}

async function downloadAllCards() {
  const cards = [...elements.idGrid.querySelectorAll(".student-id")];
  if (!cards.length) return;
  const idCount = new Set(cards.map((card) => card.dataset.studentNumber)).size;
  elements.download.disabled = true;
  clearStatus(elements.status);
  try {
    if (!window.html2canvas || !window.JSZip) {
      throw new Error("The ZIP export libraries did not load. Refresh the page and try again, or use Print 4 IDs per A4.");
    }
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages(cards);

    const zip = new JSZip();
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      elements.download.textContent = `Preparing ${index + 1} of ${cards.length}…`;
      const canvas = await html2canvas(card, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
      const image = await canvasToBlob(canvas);
      const studentNumber = safeFilenamePart(card.dataset.studentNumber || `student-${index + 1}`);
      const side = card.dataset.idSide || `side-${index + 1}`;
      zip.file(`PSU-USG-A6-ID-${studentNumber}-${side}.png`, image);
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
    setStatus(elements.status, `${idCount} front-and-back A6 ID${idCount === 1 ? "" : "s"} downloaded in one ZIP file.`, "success");
  } catch (error) {
    setStatus(elements.status, error.message, "error");
  } finally {
    elements.download.disabled = false;
    setDownloadLabel(idCount);
  }
}

function waitForImages(cards) {
  return Promise.all(cards.flatMap((card) => [...card.querySelectorAll("img")]).map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); });
  }));
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
  elements.download.textContent = `Download ${count} front & back ID${count === 1 ? "" : "s"} as ZIP`;
}
