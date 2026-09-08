import { adminLogin, clearAdminSession, getAdminSession, getApiUrl, jsonp } from "./api.js?v=20260908.1";
import { clearStatus, escapeHtml, formatDateTime, setStatus } from "./common.js?v=20260905.1";

const elements = {
  login: document.querySelector("#report-login"),
  loginForm: document.querySelector("#report-login-form"),
  password: document.querySelector("#report-password"),
  loginStatus: document.querySelector("#report-login-status"),
  logout: document.querySelector("#report-logout"),
  tools: document.querySelector("#report-tools"),
  searchForm: document.querySelector("#report-search-form"),
  search: document.querySelector("#report-student-search"),
  searchResults: document.querySelector("#student-search-results"),
  status: document.querySelector("#report-status"),
  report: document.querySelector("#student-report"),
  reportName: document.querySelector("#student-report-name"),
  reportMeta: document.querySelector("#student-report-meta"),
  reportEventCount: document.querySelector("#student-report-event-count"),
  reportTotalTime: document.querySelector("#student-report-total-time"),
  reportBody: document.querySelector("#student-report-body"),
  reportEmpty: document.querySelector("#student-report-empty"),
  reportGenerated: document.querySelector("#student-report-generated-at"),
  print: document.querySelector("#print-student-report"),
  download: document.querySelector("#download-student-report"),
};

let session = getAdminSession();
let students = [];
let currentReport = null;

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Signing in…";
  clearStatus(elements.loginStatus);
  try {
    if (!getApiUrl()) throw new Error("The Google Sheet connection is not configured. Ask the organizer to open the Control Dashboard first.");
    session = await adminLogin(elements.password.value);
    elements.password.value = "";
    await openReports();
  } catch (error) {
    setStatus(elements.loginStatus, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Open reports";
  }
});

elements.logout.addEventListener("click", showLogin);
elements.search.addEventListener("input", renderSearchResults);
elements.searchForm.addEventListener("submit", handleSearchSubmit);
elements.searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-student-number]");
  if (button) loadStudentReport(button.dataset.studentNumber);
});
elements.print.addEventListener("click", printStudentReport);
elements.download.addEventListener("click", downloadStudentReport);

if (session && getApiUrl()) openReports();
else showLogin(false);

async function openReports() {
  elements.login.hidden = true;
  elements.tools.hidden = false;
  elements.logout.hidden = false;
  elements.search.disabled = true;
  setStatus(elements.status, "Loading the official student roster…", "info");
  try {
    const health = await jsonp("health", {}, 10000);
    if (health.apiVersion < 3 || !health.capabilities?.adminReports) {
      const error = new Error("The Google Sheet backend must be updated and redeployed before the Reports page can be used.");
      error.code = "BACKEND_UPDATE_REQUIRED";
      throw error;
    }
    const response = await jsonp("students", { token: session.token });
    students = response.students || [];
    elements.search.disabled = false;
    elements.search.focus();
    setStatus(elements.status, `${students.length} students loaded. Search by name or student ID.`, "success");
  } catch (error) {
    setStatus(elements.status, error.message, "error");
    if (error.code === "SESSION_EXPIRED") showLogin();
  }
}

function showLogin(clearSession = true) {
  if (clearSession) clearAdminSession();
  session = null;
  students = [];
  currentReport = null;
  elements.login.hidden = false;
  elements.tools.hidden = true;
  elements.logout.hidden = true;
  elements.report.hidden = true;
  elements.password.focus();
}

function matchingStudents(query) {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (normalized.length < 2) return [];
  return students.filter((student) => `${student.name} ${student.studentNumber}`.toLocaleLowerCase().includes(normalized));
}

function renderSearchResults() {
  clearStatus(elements.status);
  elements.report.hidden = true;
  currentReport = null;
  const query = elements.search.value.trim();
  if (query.length < 2) {
    elements.searchResults.innerHTML = '<p class="search-guidance">Enter at least two letters or numbers to find a student.</p>';
    return;
  }
  const matches = matchingStudents(query);
  if (!matches.length) {
    elements.searchResults.innerHTML = '<p class="search-guidance">No student matches that name or ID.</p>';
    return;
  }
  elements.searchResults.innerHTML = matches.slice(0, 20).map((student) => `
    <button type="button" class="student-search-result" data-student-number="${escapeHtml(student.studentNumber)}">
      <span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.studentNumber)} · ${escapeHtml(student.program)}</small></span>
      <em>View report</em>
    </button>
  `).join("") + (matches.length > 20 ? '<p class="search-guidance">Keep typing to narrow the results.</p>' : "");
}

async function handleSearchSubmit(event) {
  event.preventDefault();
  const query = elements.search.value.trim();
  const normalizedId = query.toUpperCase().replace(/\s+/g, "");
  const exact = students.find((student) => student.studentNumber === normalizedId)
    || students.find((student) => student.name.toLocaleLowerCase() === query.toLocaleLowerCase());
  if (exact) {
    await loadStudentReport(exact.studentNumber);
    return;
  }
  const matches = matchingStudents(query);
  if (matches.length === 1) await loadStudentReport(matches[0].studentNumber);
  else renderSearchResults();
}

async function loadStudentReport(studentNumber) {
  const buttons = [...elements.searchResults.querySelectorAll("button")];
  buttons.forEach((button) => { button.disabled = true; });
  elements.report.hidden = true;
  setStatus(elements.status, "Loading attendance activities…", "info");
  try {
    const result = await jsonp("studentReport", { token: session.token, studentNumber });
    showStudentReport(result);
    elements.search.value = result.student.studentNumber;
    elements.searchResults.innerHTML = "";
    clearStatus(elements.status);
  } catch (error) {
    setStatus(elements.status, error.message, "error");
    if (error.code === "SESSION_EXPIRED") showLogin();
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function showStudentReport(result) {
  const history = Array.isArray(result.history) ? result.history : [];
  currentReport = { student: result.student, history, generatedAt: new Date().toISOString() };
  const totalSeconds = history.reduce((total, item) => total + (Number(item.totalSeconds) || 0), 0);
  elements.report.hidden = false;
  elements.reportName.textContent = result.student.name;
  elements.reportMeta.textContent = `${result.student.studentNumber} · ${result.student.program}`;
  elements.reportEventCount.textContent = String(history.length);
  elements.reportTotalTime.textContent = formatDuration(totalSeconds);
  elements.reportGenerated.textContent = formatDateTime(currentReport.generatedAt);
  elements.reportEmpty.hidden = history.length > 0;
  elements.reportBody.innerHTML = history.map((item) => `
    <tr>
      <td data-label="Activity"><strong>${escapeHtml(item.eventName)}</strong><small>${escapeHtml(item.venue || "No venue")}</small></td>
      <td data-label="Date">${escapeHtml(formatReportDate(item.attendanceDate || item.eventDate))}</td>
      <td data-label="First in">${escapeHtml(formatReportTime(item.firstTimeIn))}</td>
      <td data-label="First out">${escapeHtml(formatReportTime(item.firstTimeOut))}</td>
      <td data-label="Second in">${escapeHtml(formatReportTime(item.secondTimeIn))}</td>
      <td data-label="Second out">${escapeHtml(formatReportTime(item.secondTimeOut))}</td>
      <td data-label="Total">${escapeHtml(item.totalTime || "—")}</td>
    </tr>
  `).join("");
}

function printStudentReport() {
  if (!currentReport) return;
  document.body.classList.add("printing-attendance-report");
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-attendance-report"), { once: true });
  window.print();
}

function downloadStudentReport() {
  if (!currentReport) return;
  const headings = ["Activity", "Venue", "Attendance Date", "First Time In", "First Time Out", "Second Time In", "Second Time Out", "Total Time"];
  const rows = currentReport.history.map((item) => [
    item.eventName, item.venue, item.attendanceDate || item.eventDate,
    formatReportTime(item.firstTimeIn), formatReportTime(item.firstTimeOut),
    formatReportTime(item.secondTimeIn), formatReportTime(item.secondTimeOut), item.totalTime || "",
  ]);
  const preface = [
    ["Palawan State University – Balabac Campus"],
    ["USG Student Attendance Report"],
    ["Student", currentReport.student.name],
    ["Student Number", currentReport.student.studentNumber],
    ["Program", currentReport.student.program],
    ["Generated", formatDateTime(currentReport.generatedAt)],
    [],
  ];
  const csv = [...preface, headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `USG-Attendance-${safeFilename(currentReport.student.studentNumber)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatReportDate(value) {
  if (!value) return "—";
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })
    .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

function formatReportTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = Math.floor(total % 60);
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

function csvCell(value = "") {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFilename(value) {
  return String(value || "student").replace(/[^A-Z0-9_-]/gi, "-");
}
