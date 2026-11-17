const CF_BASE = "https://rtc.live.cloudflare.com/v1";

function cors(origin, allowed) {
  const ok = allowed === "*" || origin === allowed || origin?.startsWith("http://localhost:");
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : allowed,
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, PUT, GET, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function cf(env, path, init = {}) {
  const r = await fetch(`${CF_BASE}/apps/${env.SFU_APP_ID}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${env.SFU_APP_SECRET}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(`Cloudflare Realtime ${r.status}: ${body?.errorDescription || body?.message || text}`);
  return body;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const headers = cors(origin, env.ALLOWED_ORIGIN || "*");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        return json({ ok: true, service: "burungitaw-live-worker" }, 200, headers);
      }

      if (url.pathname === "/api/sfu/session" && req.method === "POST") {
        const data = await cf(env, "/sessions/new", { method: "POST" });
        return json(data, 200, headers);
      }

      const trackNew = url.pathname.match(/^\/api\/sfu\/session\/([^/]+)\/tracks$/);
      if (trackNew && req.method === "POST") {
        const payload = await req.json();
        const data = await cf(env, `/sessions/${encodeURIComponent(trackNew[1])}/tracks/new`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        return json(data, 200, headers);
      }

      const renegotiate = url.pathname.match(/^\/api\/sfu\/session\/([^/]+)\/renegotiate$/);
      if (renegotiate && req.method === "PUT") {
        const payload = await req.json();
        const data = await cf(env, `/sessions/${encodeURIComponent(renegotiate[1])}/renegotiate`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        return json(data, 200, headers);
      }

      const inspect = url.pathname.match(/^\/api\/sfu\/session\/([^/]+)$/);
      if (inspect && req.method === "GET") {
        const data = await cf(env, `/sessions/${encodeURIComponent(inspect[1])}`, { method: "GET" });
        return json(data, 200, headers);
      }

      return json({ error: "Not found" }, 404, headers);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500, headers);
    }
  }
};
