import { clearStatus, escapeHtml, formatDateTime, setStatus } from "./common.js?v=20260905.1";
import { getOwnProfile, getSession, getSupabase, signInAdmin, signOut, supabaseConfig } from "./supabase-client.js?v=20260917.2";

const definitions = {
  announcements: { table: "site_announcements", title: "Announcements", order: "created_at", fields: [text("title", "Title", true), text("category", "Category"), area("summary", "Short summary"), area("body", "Complete announcement", true)] },
  events: { table: "site_events", title: "Events", order: "starts_at", fields: [text("title", "Activity title", true), text("venue", "Venue"), datetime("starts_at", "Starts", true), datetime("ends_at", "Ends"), area("description", "Description")] },
  officers: { table: "site_officers", title: "Officers", order: "display_order", fields: [text("full_name", "Full name", true), text("position", "Position", true), text("program", "Program or office"), url("photo_url", "Public photo URL"), number("display_order", "Display order")] },
  projects: { table: "site_projects", title: "Projects", order: "created_at", fields: [text("title", "Project title", true), text("status", "Status"), area("description", "Description"), area("accomplishment", "Accomplishment or result")] },
  documents: { table: "site_documents", title: "Documents", order: "published_at", fields: [text("title", "Document title", true), text("category", "Category"), area("description", "Description"), url("file_url", "Public document URL", true)] },
};

const elements = {
  login: document.querySelector("#site-admin-login"), loginForm: document.querySelector("#site-admin-login-form"), email: document.querySelector("#site-admin-email"), password: document.querySelector("#site-admin-password"), loginStatus: document.querySelector("#site-admin-login-status"), logout: document.querySelector("#site-admin-logout"), content: document.querySelector("#site-admin-content"), tabs: document.querySelector(".content-tabs"), form: document.querySelector("#content-form"), id: document.querySelector("#content-id"), fields: document.querySelector("#content-fields"), published: document.querySelector("#content-published"), formStatus: document.querySelector("#content-form-status"), formEyebrow: document.querySelector("#content-form-eyebrow"), formTitle: document.querySelector("#content-form-title"), cancel: document.querySelector("#cancel-content-edit"), listTitle: document.querySelector("#content-list-title"), list: document.querySelector("#content-admin-list"), listStatus: document.querySelector("#content-list-status"), refresh: document.querySelector("#refresh-content"),
};

let currentType = "announcements";
let currentRows = [];
elements.email.value = supabaseConfig().adminEmail;
renderForm();
restoreSession();

elements.loginForm.addEventListener("submit", async (event) => { event.preventDefault(); const button = event.submitter; button.disabled = true; clearStatus(elements.loginStatus); try { await signInAdmin(elements.password.value, elements.email.value.trim()); elements.password.value = ""; await openAdmin(); } catch (error) { setStatus(elements.loginStatus, error.message, "error"); } finally { button.disabled = false; } });
elements.logout.addEventListener("click", async () => { await signOut(); location.reload(); });
elements.tabs.addEventListener("click", async (event) => { const button = event.target.closest("[data-content-tab]"); if (!button) return; currentType = button.dataset.contentTab; elements.tabs.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button)); resetForm(); renderForm(); await loadContent(); });
elements.refresh.addEventListener("click", loadContent);
elements.cancel.addEventListener("click", () => { resetForm(); renderForm(); });
elements.form.addEventListener("submit", saveContent);
elements.list.addEventListener("click", handleListAction);

async function restoreSession() { try { if (!await getSession()) return; const profile = await getOwnProfile(); if (profile.role === "admin" && profile.account_status === "active") await openAdmin(); } catch { await signOut().catch(() => {}); } }
async function openAdmin() { elements.login.hidden = true; elements.content.hidden = false; elements.logout.hidden = false; await loadContent(); }

function renderForm(row = null) {
  const definition = definitions[currentType];
  elements.formEyebrow.textContent = row ? `Edit ${definition.title.slice(0, -1).toLowerCase()}` : `New ${definition.title.slice(0, -1).toLowerCase()}`;
  elements.formTitle.textContent = row ? "Update content" : "Publish content";
  elements.listTitle.textContent = definition.title;
  elements.fields.innerHTML = definition.fields.map((field) => renderField(field, row?.[field.name])).join("");
  elements.published.checked = row ? Boolean(row.is_published) : true;
  elements.cancel.hidden = !row;
}

async function loadContent() {
  clearStatus(elements.listStatus); elements.refresh.disabled = true;
  const definition = definitions[currentType];
  try { const { data, error } = await getSupabase().from(definition.table).select("*").order(definition.order, { ascending: currentType === "officers" }); if (error) throw error; currentRows = data || []; renderList(); }
  catch (error) { setStatus(elements.listStatus, migrationMessage(error), "error"); }
  finally { elements.refresh.disabled = false; }
}

function renderList() {
  if (!currentRows.length) { elements.list.innerHTML = `<p class="search-guidance">No ${escapeHtml(definitions[currentType].title.toLowerCase())} yet.</p>`; return; }
  elements.list.innerHTML = currentRows.map((row) => `<article class="content-admin-item"><div><span class="status-tag ${row.is_published ? "" : "status-tag--ended"}">${row.is_published ? "Published" : "Draft"}</span><h3>${escapeHtml(primaryValue(row))}</h3><p>${escapeHtml(secondaryValue(row))}</p></div><div class="toolbar"><button class="button button--quiet button--small" data-action="edit" data-id="${row.id}" type="button">Edit</button><button class="button button--danger button--small" data-action="delete" data-id="${row.id}" type="button">Delete</button></div></article>`).join("");
}

async function saveContent(event) {
  event.preventDefault(); const button = event.submitter; button.disabled = true; clearStatus(elements.formStatus);
  const definition = definitions[currentType]; const payload = { is_published: elements.published.checked };
  for (const field of definition.fields) { const input = elements.form.elements[field.name]; payload[field.name] = input.value.trim() || null; if (field.type === "number") payload[field.name] = Number(input.value || 0); if (field.type === "datetime-local" && input.value) payload[field.name] = new Date(input.value).toISOString(); }
  if (elements.published.checked && ["announcements", "documents"].includes(currentType)) payload.published_at = new Date().toISOString();
  try { let query = getSupabase().from(definition.table); const result = elements.id.value ? await query.update(payload).eq("id", elements.id.value) : await query.insert(payload); if (result.error) throw result.error; setStatus(elements.formStatus, "Content saved successfully.", "success"); resetForm(); renderForm(); await loadContent(); }
  catch (error) { setStatus(elements.formStatus, migrationMessage(error), "error"); }
  finally { button.disabled = false; }
}

async function handleListAction(event) {
  const button = event.target.closest("button[data-action]"); if (!button) return; const row = currentRows.find((item) => item.id === button.dataset.id); if (!row) return;
  if (button.dataset.action === "edit") { elements.id.value = row.id; renderForm(row); elements.form.scrollIntoView({ behavior: "smooth" }); return; }
  if (!confirm(`Delete ${primaryValue(row)}? This cannot be undone.`)) return;
  button.disabled = true; const { error } = await getSupabase().from(definitions[currentType].table).delete().eq("id", row.id); if (error) setStatus(elements.listStatus, error.message, "error"); else await loadContent();
}

function resetForm() { elements.id.value = ""; elements.form.reset(); elements.published.checked = true; elements.cancel.hidden = true; clearStatus(elements.formStatus); }
function renderField(field, value = "") { const normalized = field.type === "datetime-local" && value ? localDateTime(value) : value ?? ""; const required = field.required ? " required" : ""; if (field.type === "textarea") return `<label class="field"><span>${escapeHtml(field.label)}</span><textarea name="${field.name}" rows="5"${required}>${escapeHtml(normalized)}</textarea></label>`; return `<label class="field"><span>${escapeHtml(field.label)}</span><input type="${field.type}" name="${field.name}" value="${escapeHtml(normalized)}"${required}></label>`; }
function primaryValue(row) { return row.title || row.full_name || "Untitled content"; }
function secondaryValue(row) { return row.summary || row.description || row.position || row.category || (row.starts_at ? formatDateTime(row.starts_at) : ""); }
function localDateTime(value) { const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); }
function migrationMessage(error) { return /relation .* does not exist|schema cache/i.test(error?.message || "") ? "Run the supplied 004_usg_site.sql migration in Supabase, then refresh this page." : error?.message || "The content request failed."; }
function text(name, label, required = false) { return { name, label, type: "text", required }; }
function area(name, label, required = false) { return { name, label, type: "textarea", required }; }
function datetime(name, label, required = false) { return { name, label, type: "datetime-local", required }; }
function url(name, label, required = false) { return { name, label, type: "url", required }; }
function number(name, label) { return { name, label, type: "number", required: false }; }
