import { adminLogin, buildScannerLink, clearAdminSession, getAdminSession, getApiUrl, jsonp, setApiUrl } from "./api.js?v=20260905.1";
import { clearStatus, escapeHtml, formatDateTime, setStatus } from "./common.js";

const elements = {
  apiForm: document.querySelector("#api-form"),
  apiUrl: document.querySelector("#api-url"),
  apiStatus: document.querySelector("#api-status"),
  login: document.querySelector("#admin-login"),
  loginForm: document.querySelector("#admin-login-form"),
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

let session = getAdminSession();
let issuedCode = "";
let issuedEvent = null;

elements.apiUrl.value = getApiUrl();
setEventDefaults();

elements.apiForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Checking…";
  clearStatus(elements.apiStatus);
  try {
    setApiUrl(elements.apiUrl.value);
    const result = await jsonp("health");
    setStatus(elements.apiStatus, result.configured ? "Connected to the USG Attendance Sheet." : "The web app is reachable, but Sheet setup has not been completed.", result.configured ? "success" : "info");
  } catch (error) {
    setStatus(elements.apiStatus, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Save connection";
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Signing in…";
  clearStatus(elements.loginStatus);
  try {
    session = await adminLogin(elements.password.value);
    elements.password.value = "";
    await openDashboard();
  } catch (error) {
    setStatus(elements.loginStatus, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Open control";
  }
});

elements.logout.addEventListener("click", () => {
  clearAdminSession();
  session = null;
  elements.content.hidden = true;
  elements.logout.hidden = true;
  elements.login.hidden = false;
  elements.password.focus();
});

elements.eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Creating event…";
  clearStatus(elements.eventFormStatus);
  try {
    const response = await jsonp("createEvent", {
      token: session.token,
      name: elements.eventName.value.trim(),
      venue: elements.eventVenue.value.trim(),
      eventDate: elements.eventDate.value,
      startTime: elements.eventTime.value,
      expiresAt: elements.eventExpiry.value,
    }, 30000);
    showIssuedCode(response.event, response.controlCode, response.expiresAt);
    setStatus(elements.eventFormStatus, `${response.event.name} was created as ${response.event.sheetName}.`, "success");
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
    const confirmed = await confirmAction("End this event?", `Attendance scanning for ${eventName} will be stopped. Recorded times will remain in the Sheet.`);
    if (!confirmed) return;
    await eventAction(button, "endEvent", eventNo);
  }
});

if (session && getApiUrl()) openDashboard();

async function openDashboard() {
  elements.login.hidden = true;
  elements.content.hidden = false;
  elements.logout.hidden = false;
  await loadEvents();
}

async function loadEvents() {
  clearStatus(elements.eventsStatus);
  elements.refreshEvents.disabled = true;
  elements.refreshEvents.textContent = "Refreshing…";
  try {
    const response = await jsonp("listEvents", { token: session.token });
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
        <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.venue || "No venue")} · ${escapeHtml(item.sheetName)}</p></div>
        <span class="status-tag ${item.status === "ENDED" ? "status-tag--ended" : ""}">${escapeHtml(item.status)}</span>
      </div>
      <p>${escapeHtml(item.eventDate)} · ${escapeHtml(item.startTime)}<br>Code expires ${escapeHtml(formatDateTime(item.expiresAt))}</p>
      <div class="event-stats" aria-label="Attendance totals">
        <div class="event-stat"><strong>${item.counts.BEEd}</strong><small>BEEd</small></div>
        <div class="event-stat"><strong>${item.counts.BSE}</strong><small>BSE</small></div>
        <div class="event-stat"><strong>${item.counts.BSA}</strong><small>BSA</small></div>
        <div class="event-stat"><strong>${item.counts.total}</strong><small>Total</small></div>
      </div>
      ${item.status === "ACTIVE" ? `<div class="event-card__actions">
        <button class="button button--quiet button--small" type="button" data-action="rotate" data-event-no="${item.eventNo}" data-event-name="${escapeHtml(item.name)}">New code</button>
        <button class="button button--danger button--small" type="button" data-action="end" data-event-no="${item.eventNo}" data-event-name="${escapeHtml(item.name)}">End event</button>
      </div>` : ""}
    </article>
  `).join("");
}

async function eventAction(button, action, eventNo, onSuccess) {
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = "Working…";
  clearStatus(elements.eventsStatus);
  try {
    const response = await jsonp(action, { token: session.token, eventNo });
    onSuccess?.(response);
    await loadEvents();
  } catch (error) {
    handleSessionError(error, elements.eventsStatus);
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

function showIssuedCode(event, code, expiresAt) {
  issuedCode = code;
  issuedEvent = event;
  elements.codeEmpty.hidden = true;
  elements.codeResult.hidden = false;
  elements.codeEventName.textContent = event.name;
  elements.codeOutput.textContent = formatCode(code);
  elements.codeExpiry.textContent = `Expires ${formatDateTime(expiresAt)}`;
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

function handleSessionError(error, statusElement) {
  setStatus(statusElement, error.message, "error");
  if (error.code === "SESSION_EXPIRED") {
    clearAdminSession();
    session = null;
    elements.content.hidden = true;
    elements.logout.hidden = true;
    elements.login.hidden = false;
  }
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
