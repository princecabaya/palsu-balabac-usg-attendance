import { supabaseAction } from "./supabase-attendance-api.js?v=20260918.2";
import { getOwnProfile, getSession, signInAdmin, signOut, supabaseConfig } from "./supabase-client.js?v=20260917.2";
import { clearStatus, escapeHtml, formatDateTime, setStatus } from "./common.js?v=20260905.1";

const elements = {
  login: document.querySelector("#admin-login"),
  loginForm: document.querySelector("#admin-login-form"),
  email: document.querySelector("#admin-email"),
  password: document.querySelector("#admin-password"),
  loginStatus: document.querySelector("#admin-login-status"),
  logout: document.querySelector("#admin-logout"),
  content: document.querySelector("#dashboard-content"),
  eventForm: document.querySelector("#event-form"),
  eventFormStatus: document.querySelector("#event-form-status"),
  eventName: document.querySelector("#event-name-input"),
  eventVenue: document.querySelector("#event-venue-input"),
  eventDate: document.querySelector("#event-date-input"),
  eventTime: document.querySelector("#event-time-input"),
  eventExpiry: document.querySelector("#event-expiry-input"),
  codeEmpty: document.querySelector("#code-empty"),
  codeResult: document.querySelector("#code-result"),
  codeEventName: document.querySelector("#code-event-name"),
  codeOutput: document.querySelector("#control-code-output"),
  codeExpiry: document.querySelector("#code-expiry"),
  copyCode: document.querySelector("#copy-code"),
  copyLink: document.querySelector("#copy-link"),
  refreshEvents: document.querySelector("#refresh-events"),
  eventCards: document.querySelector("#event-cards"),
  eventsEmpty: document.querySelector("#events-empty"),
  eventsStatus: document.querySelector("#events-status"),
  dialog: document.querySelector("#confirm-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogMessage: document.querySelector("#dialog-message"),
};

let issuedCode = "";
let issuedEventNo = "";

elements.email.value = supabaseConfig().adminEmail;
setEventDefaults();
restoreAdminSession();

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Signing in…";
  clearStatus(elements.loginStatus);
  try {
    await signInAdmin(elements.password.value, elements.email.value.trim());
    elements.password.value = "";
    await openDashboard();
  } catch (error) {
    setStatus(elements.loginStatus, friendlyError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = "Open control";
  }
});

elements.logout.addEventListener("click", logout);

elements.eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Creating event…";
  clearStatus(elements.eventFormStatus);
  try {
    const response = await supabaseAction("createEvent", {
      name: elements.eventName.value.trim(),
      venue: elements.eventVenue.value.trim(),
      eventDate: elements.eventDate.value,
      startTime: elements.eventTime.value,
      expiresAt: elements.eventExpiry.value,
    });
    showIssuedCode(response.event, response.controlCode, response.expiresAt);
    setStatus(elements.eventFormStatus, `${response.event.name} was created in Supabase.`, "success");
    elements.eventName.value = "";
    elements.eventVenue.value = "";
    setEventDefaults();
    await loadEvents();
  } catch (error) {
    handleSessionError(error, elements.eventFormStatus);
  } finally {
    button.disabled = false;
    button.textContent = "Create event and code";
  }
});

elements.refreshEvents.addEventListener("click", loadEvents);
elements.copyCode.addEventListener("click", () => copyText(issuedCode, elements.copyCode, "Code copied"));
elements.copyLink.addEventListener("click", () => copyText(buildScannerLink(), elements.copyLink, "Link copied"));

elements.eventCards.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const eventNo = button.dataset.eventNo;
  const eventName = button.dataset.eventName;
  if (button.dataset.action === "rotate") {
    const confirmed = await confirmAction("Issue a new control code?", `The previous code and any scanner sessions for ${eventName} will stop working.`);
    if (!confirmed) return;
    await eventAction(button, "rotateCode", eventNo, (response) => showIssuedCode(response.event, response.controlCode, response.expiresAt));
  }
  if (button.dataset.action === "end") {
    const confirmed = await confirmAction("End this event?", `Attendance scanning for ${eventName} will be stopped. Recorded attendance will remain in Supabase.`);
    if (!confirmed) return;
    await eventAction(button, "endEvent", eventNo);
  }
  if (button.dataset.action === "delete") {
    const attendanceCount = Number(button.dataset.attendanceCount || 0);
    const recordLabel = attendanceCount === 1 ? "attendance record" : "attendance records";
    const confirmed = await confirmAction(
      "Permanently delete this event?",
      `This will permanently remove ${eventName}, its scanner codes, and ${attendanceCount} ${recordLabel}. This cannot be undone.`,
    );
    if (!confirmed) return;
    await eventAction(button, "deleteEvent", eventNo, () => {
      if (issuedEventNo === eventNo) clearIssuedCode();
    }, `${eventName} and its attendance records were permanently deleted.`);
  }
  if (button.dataset.action === "archive") {
    const confirmed = await confirmAction(
      "Archive this event?",
      `${eventName} will be hidden from student attendance histories, reports, and this event list. Its records will remain safely stored in Supabase.`,
    );
    if (!confirmed) return;
    await eventAction(button, "archiveEvent", eventNo, () => {
      if (issuedEventNo === eventNo) clearIssuedCode();
    }, `${eventName} was archived and removed from student records.`);
  }
});

async function restoreAdminSession() {
  try {
    if (!await getSession()) return;
    const profile = await getOwnProfile();
    if (profile.role === "admin" && profile.account_status === "active") await openDashboard();
  } catch {
    await signOut().catch(() => {});
  }
}

async function openDashboard() {
  elements.login.hidden = true;
  elements.content.hidden = false;
  elements.logout.hidden = false;
  await loadEvents();
}

async function logout() {
  await signOut().catch(() => {});
  elements.content.hidden = true;
  elements.logout.hidden = true;
  elements.login.hidden = false;
  elements.email.focus();
}

async function loadEvents() {
  clearStatus(elements.eventsStatus);
  elements.refreshEvents.disabled = true;
  elements.refreshEvents.textContent = "Refreshing…";
  try {
    const response = await supabaseAction("listEvents");
    renderEvents(response.events);
  } catch (error) {
    handleSessionError(error, elements.eventsStatus);
  } finally {
    elements.refreshEvents.disabled = false;
    elements.refreshEvents.textContent = "Refresh totals";
  }
}

function renderEvents(events) {
  elements.eventsEmpty.hidden = events.length > 0;
  elements.eventCards.innerHTML = events.map((item) => `
    <article class="event-card">
      <div class="event-card__top">
        <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.venue || "No venue")}</p></div>
        <span class="status-tag ${item.status === "ENDED" ? "status-tag--ended" : ""}">${escapeHtml(item.status)}</span>
      </div>
      <p>${escapeHtml(item.eventDate)} · ${escapeHtml(item.startTime)}<br>Code expires ${escapeHtml(formatDateTime(item.expiresAt))}</p>
      <div class="event-stats" aria-label="Attendance totals">
        <div class="event-stat"><strong>${item.counts.BEEd}</strong><small>BEEd</small></div>
        <div class="event-stat"><strong>${item.counts.BSE}</strong><small>BSE</small></div>
        <div class="event-stat"><strong>${item.counts.BSA}</strong><small>BSA</small></div>
        <div class="event-stat"><strong>${item.counts.total}</strong><small>Total</small></div>
      </div>
      <div class="event-card__actions">
        ${item.status === "ACTIVE" ? `
          <button class="button button--quiet button--small" type="button" data-action="rotate" data-event-no="${item.eventNo}" data-event-name="${escapeHtml(item.name)}">New code</button>
          <button class="button button--quiet button--small" type="button" data-action="end" data-event-no="${item.eventNo}" data-event-name="${escapeHtml(item.name)}">End event</button>
        ` : ""}
        <button class="button button--quiet button--small" type="button" data-action="archive" data-event-no="${item.eventNo}" data-event-name="${escapeHtml(item.name)}">Archive</button>
        <button class="button button--danger button--small" type="button" data-action="delete" data-event-no="${item.eventNo}" data-event-name="${escapeHtml(item.name)}" data-attendance-count="${item.counts.total}">Delete</button>
      </div>
    </article>
  `).join("");
}

async function eventAction(button, action, eventNo, onSuccess, successMessage = "") {
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = "Working…";
  clearStatus(elements.eventsStatus);
  try {
    const response = await supabaseAction(action, { eventNo });
    onSuccess?.(response);
    await loadEvents();
    if (successMessage) setStatus(elements.eventsStatus, successMessage, "success");
  } catch (error) {
    handleSessionError(error, elements.eventsStatus);
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

function showIssuedCode(event, code, expiresAt) {
  issuedCode = code;
  issuedEventNo = event.eventNo || event.id || "";
  elements.codeEmpty.hidden = true;
  elements.codeResult.hidden = false;
  elements.codeEventName.textContent = event.name;
  elements.codeOutput.textContent = formatCode(code);
  elements.codeExpiry.textContent = `Expires ${formatDateTime(expiresAt)}`;
}

function clearIssuedCode() {
  issuedCode = "";
  issuedEventNo = "";
  elements.codeResult.hidden = true;
  elements.codeEmpty.hidden = false;
}

function buildScannerLink() {
  const url = new URL("scanner.html", location.href);
  url.searchParams.set("backend", "supabase");
  return url.toString();
}

function formatCode(code) {
  const clean = String(code).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

async function copyText(value, button, label) {
  if (!value) return;
  const oldText = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = label;
    setTimeout(() => { button.textContent = oldText; }, 1600);
  } catch {
    window.prompt("Copy this value:", value);
  }
}

function friendlyError(error) {
  const message = String(error?.message || "The Supabase request could not be completed.");
  if (/EXPIRY_MUST_BE_FUTURE/i.test(message)) return "Choose a control-code expiry time in the future.";
  if (/ACTIVE_EVENT_NOT_FOUND/i.test(message)) return "This event is no longer active. Refresh the attendance overview.";
  if (/EVENT_NOT_FOUND/i.test(message)) return "This event was already deleted. Refresh the attendance overview.";
  if (/EVENT_ALREADY_ARCHIVED/i.test(message)) return "This event is already archived and hidden from reports.";
  if (/ADMIN_REQUIRED/i.test(message)) return "Active USG administrator access is required.";
  if (/JWT|refresh token|session/i.test(message)) return "Your administrator session expired. Sign in again.";
  return message;
}

async function handleSessionError(error, statusElement) {
  const message = friendlyError(error);
  setStatus(statusElement, message, "error");
  if (/session expired|JWT|refresh token/i.test(message)) await logout();
}

function confirmAction(title, message) {
  elements.dialogTitle.textContent = title;
  elements.dialogMessage.textContent = message;
  elements.dialog.showModal();
  return new Promise((resolve) => {
    elements.dialog.addEventListener("close", () => resolve(elements.dialog.returnValue === "confirm"), { once: true });
  });
}

function setEventDefaults() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  elements.eventDate.value = date;
  elements.eventTime.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  elements.eventExpiry.value = `${date}T23:59`;
}
