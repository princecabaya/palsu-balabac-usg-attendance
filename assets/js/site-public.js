import { escapeHtml, formatDateTime } from "./common.js?v=20260905.1";
import { getSupabase } from "./supabase-client.js?v=20260917.2";

const page = document.body.dataset.publicPage || "home";
renderSharedShell();
bindMenu();
loadPageContent().catch(() => {
  // Static empty states remain visible until the content migration is installed.
});

function renderSharedShell() {
  const header = document.querySelector("[data-public-header]");
  if (header) {
    const active = header.dataset.publicHeader;
    const links = [
      ["home", "index.html", "Home"], ["announcements", "announcements.html", "Announcements"],
      ["events", "events.html", "Events"], ["officers", "officers.html", "Officers"],
      ["projects", "projects.html", "Projects"], ["documents", "transparency.html", "Transparency"],
    ];
    header.outerHTML = `<header class="site-header public-header">
      <a class="brand" href="index.html" aria-label="PalSU Balabac USG home"><span class="brand__seals"><img src="assets/img/psu-logo.png" alt="Palawan State University logo"><img src="assets/img/usg-logo.png" alt="University Student Government logo"></span><span><strong>PalSU Balabac USG</strong><small>Official University Student Government Site</small></span></a>
      <button class="public-menu-button" type="button" aria-expanded="false" aria-controls="public-navigation">Menu</button>
      <nav class="nav public-nav" id="public-navigation" aria-label="Public navigation">${links.map(([key, href, label]) => `<a class="${active === key ? "is-active" : ""}" href="${href}">${label}</a>`).join("")}<a href="portal.html">Student Portal</a></nav>
    </header>`;
  }
  const footer = document.querySelector("[data-public-footer]");
  if (footer) footer.outerHTML = `<footer class="public-footer"><div><strong>Palawan State University – Balabac Campus</strong><span>University Student Government</span></div><div class="public-footer__links"><a href="privacy.html">Privacy</a><a href="site-admin.html">USG Administration</a></div></footer>`;
}

function bindMenu() {
  const button = document.querySelector(".public-menu-button");
  const nav = document.querySelector(".public-nav");
  if (!button || !nav) return;
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  });
}

async function loadPageContent() {
  const supabase = getSupabase();
  if (page === "home") {
    const [announcements, events] = await Promise.all([
      supabase.from("site_announcements").select("*").eq("is_published", true).order("published_at", { ascending: false }).limit(3),
      supabase.from("site_events").select("*").eq("is_published", true).gte("ends_at", new Date().toISOString()).order("starts_at").limit(3),
    ]);
    if (!announcements.error && announcements.data?.length) document.querySelector("#home-announcements").innerHTML = announcements.data.map(announcementCard).join("");
    if (!events.error && events.data?.length) document.querySelector("#home-events").innerHTML = events.data.map(eventCard).join("");
    return;
  }

  const target = document.querySelector("#public-content-list");
  if (!target) return;
  const config = {
    announcements: ["site_announcements", "published_at", false, announcementCard],
    events: ["site_events", "starts_at", true, eventCard],
    officers: ["site_officers", "display_order", true, officerCard],
    projects: ["site_projects", "created_at", false, projectCard],
    documents: ["site_documents", "published_at", false, documentCard],
  }[page];
  if (!config) return;
  const [table, order, ascending, renderer] = config;
  const { data, error } = await supabase.from(table).select("*").eq("is_published", true).order(order, { ascending });
  if (error || !data?.length) return;
  target.innerHTML = data.map(renderer).join("");
}

function announcementCard(item) {
  return `<article class="public-card announcement-card"><p class="content-label">${escapeHtml(item.category || "Announcement")}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary || item.body || "")}</p><time>${escapeHtml(formatDateTime(item.published_at))}</time>${item.body && item.summary ? `<details><summary>Read complete announcement</summary><p>${escapeHtml(item.body)}</p></details>` : ""}</article>`;
}

function eventCard(item) {
  return `<article class="public-card event-public-card"><p class="content-label">${escapeHtml(eventState(item))}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.description || "")}</p><dl><div><dt>Date and time</dt><dd>${escapeHtml(formatDateTime(item.starts_at))}</dd></div><div><dt>Venue</dt><dd>${escapeHtml(item.venue || "To be announced")}</dd></div></dl></article>`;
}

function officerCard(item) {
  const initials = String(item.full_name || "USG").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const photoUrl = safeExternalUrl(item.photo_url);
  return `<article class="officer-card">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Portrait of ${escapeHtml(item.full_name)}" loading="lazy">` : `<div class="officer-card__placeholder" aria-hidden="true">${escapeHtml(initials)}</div>`}<div><p class="content-label">${escapeHtml(item.position)}</p><h2>${escapeHtml(item.full_name)}</h2><p>${escapeHtml(item.program || "University Student Government")}</p></div></article>`;
}

function projectCard(item) {
  return `<article class="public-card project-card"><p class="content-label">${escapeHtml(item.status || "USG Project")}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.description || "")}</p>${item.accomplishment ? `<div class="project-result"><strong>Accomplishment</strong><p>${escapeHtml(item.accomplishment)}</p></div>` : ""}</article>`;
}

function documentCard(item) {
  const fileUrl = safeExternalUrl(item.file_url);
  return `<article class="document-card"><div><p class="content-label">${escapeHtml(item.category || "Public document")}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.description || "")}</p><time>${escapeHtml(formatDateTime(item.published_at))}</time></div>${fileUrl ? `<a class="button button--quiet" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">Open document</a>` : ""}</article>`;
}

function eventState(item) {
  const now = Date.now();
  if (new Date(item.starts_at).getTime() > now) return "Upcoming activity";
  if (item.ends_at && new Date(item.ends_at).getTime() < now) return "Completed activity";
  return "Ongoing activity";
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
