const CONFIG_KEY = "psu-usg-api-url";
const ADMIN_SESSION_KEY = "psu-usg-admin-session";
const SCANNER_SESSION_KEY = "psu-usg-scanner-session";

function configuredUrl() {
  const queryUrl = new URLSearchParams(location.search).get("api");
  if (queryUrl && isAppsScriptUrl(queryUrl)) {
    localStorage.setItem(CONFIG_KEY, queryUrl);
    return queryUrl;
  }
  return localStorage.getItem(CONFIG_KEY) || window.USG_ATTENDANCE_CONFIG?.apiUrl || "";
}

export function isAppsScriptUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:" && url.hostname === "script.google.com" && /\/macros\/s\/.+\/exec$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function getApiUrl() {
  return configuredUrl();
}

export function setApiUrl(value) {
  const url = String(value).trim();
  if (!isAppsScriptUrl(url)) throw new Error("Paste the Google Apps Script web app URL ending in /exec.");
  localStorage.setItem(CONFIG_KEY, url);
  return url;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function jsonp(action, params = {}, timeoutMs = 18000) {
  try {
    return await jsonpOnce(action, params, timeoutMs);
  } catch (error) {
    if (error.code === "NETWORK_ERROR" && navigator.onLine !== false) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      return jsonpOnce(action, params, timeoutMs);
    }
    throw error;
  }
}

function jsonpOnce(action, params = {}, timeoutMs = 18000) {
  const apiUrl = getApiUrl();
  if (!apiUrl) return Promise.reject(new Error("The Google Sheet connection has not been configured."));

  return new Promise((resolve, reject) => {
    const callback = `__psu_usg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => finish(connectionError("TIMEOUT")), timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    function finish(error, data) {
      cleanup();
      if (error) reject(error);
      else if (!data?.ok) reject(Object.assign(new Error(data?.message || "The request could not be completed."), { code: data?.code }));
      else resolve(data);
    }

    window[callback] = (data) => finish(null, data);
    script.onerror = () => finish(connectionError("NETWORK_ERROR"));

    const url = new URL(apiUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callback);
    url.searchParams.set("_", Date.now());
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function connectionError(code) {
  let message;
  if (navigator.onLine === false) {
    message = "This device is offline. Reconnect to the internet before recording attendance.";
  } else if (/SamsungBrowser/i.test(navigator.userAgent)) {
    message = "The attendance server could not be reached. In Samsung Internet, turn off the Content Blocker for this site or open the scanner in Google Chrome. Also confirm that Apps Script allows Anyone, including signed-out users.";
  } else {
    message = "The attendance server could not be reached. Check the internet connection and confirm that Apps Script is deployed as Execute as Me with access for Anyone, including signed-out users.";
  }
  return Object.assign(new Error(message), { code });
}

async function challengeLogin(scope, secret) {
  const challenge = await jsonp("challenge", { scope });
  const secretHash = await sha256(scope === "scanner" ? normalizeControlCode(secret) : secret);
  const proof = await sha256(`${secretHash}:${challenge.nonce}`);
  return jsonp(scope === "scanner" ? "controlLogin" : "adminLogin", {
    nonce: challenge.nonce,
    proof,
  });
}

export async function adminLogin(password) {
  const result = await challengeLogin("admin", password);
  const session = { token: result.token, expiresAt: result.expiresAt };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function scannerLogin(code) {
  const result = await challengeLogin("scanner", code);
  const session = {
    token: result.token,
    expiresAt: result.expiresAt,
    event: result.event,
  };
  sessionStorage.setItem(SCANNER_SESSION_KEY, JSON.stringify(session));
  return session;
}

function readSession(key) {
  try {
    const session = JSON.parse((key === SCANNER_SESSION_KEY ? sessionStorage : localStorage).getItem(key));
    if (!session?.token || new Date(session.expiresAt).getTime() <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function getAdminSession() {
  return readSession(ADMIN_SESSION_KEY);
}

export function getScannerSession() {
  return readSession(SCANNER_SESSION_KEY);
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

export function clearScannerSession() {
  sessionStorage.removeItem(SCANNER_SESSION_KEY);
}

export function normalizeControlCode(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function makeRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildScannerLink() {
  const url = new URL("scanner.html", location.href);
  const apiUrl = getApiUrl();
  const configuredApiUrl = window.USG_ATTENDANCE_CONFIG?.apiUrl || "";
  if (!configuredApiUrl && apiUrl) url.searchParams.set("api", apiUrl);
  return url.toString();
}
