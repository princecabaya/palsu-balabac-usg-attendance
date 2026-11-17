const SUPABASE_URL = "https://edfcehmttcwhhknywflq.supabase.co";
const SUPABASE_KEY = "sb_publishable_XDI9PRlXfmA31Os3lQtthA_-gqwNXFI";

const SELF_SCOPED = new Set(["student-photos", "student-id-copies"]);
const ADMIN_ONLY = new Set(["exam-proctor-photos", "exam-proctor-audio", "exam-stimuli"]);
const ALLOWED_PREFIXES = new Set([...SELF_SCOPED, ...ADMIN_ONLY]);

function cors(origin, allowed) {
  const ok = allowed === "*" || origin === allowed || origin?.startsWith("http://localhost:");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-file-name",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, HEAD, OPTIONS",
    "Access-Control-Expose-Headers": "content-length, content-type, etag",
    "Vary": "Origin"
  };
}

function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type":"application/json", ...headers }
  });
}

function safeName(name="file") {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").slice(0,160) || "file";
}

function splitKey(key) {
  const parts = key.split("/").filter(Boolean);
  return { prefix: parts[0] || "", owner: parts[1] || "", parts };
}

async function auth(req) {
  const h = req.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw Object.assign(new Error("Authentication required"), { status:401 });

  const ur = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { "apikey":SUPABASE_KEY, "Authorization":"Bearer " + token }
  });
  if (!ur.ok) throw Object.assign(new Error("Invalid or expired session"), { status:401 });
  const user = await ur.json();

  const pr = await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + encodeURIComponent(user.id) + "&select=id,role,account_status", {
    headers: {
      "apikey":SUPABASE_KEY,
      "Authorization":"Bearer " + token,
      "Accept":"application/vnd.pgrst.object+json"
    }
  });
  if (!pr.ok) throw Object.assign(new Error("Profile lookup failed"), { status:403 });
  const profile = await pr.json();
  if (profile.account_status === "inactive") throw Object.assign(new Error("Inactive account"), { status:403 });

  return { user, profile, isAdmin: profile.role === "admin" };
}

function authorizeKey(ctx, key, write=false) {
  const {prefix, owner, parts} = splitKey(key);
  if (!ALLOWED_PREFIXES.has(prefix) || parts.length < 2) {
    throw Object.assign(new Error("Invalid file path"), { status:400 });
  }
  if (ctx.isAdmin) return;
  if (!SELF_SCOPED.has(prefix)) {
    throw Object.assign(new Error("Admin access required"), { status:403 });
  }
  if (owner !== ctx.user.id) {
    throw Object.assign(new Error("You can only access your own files"), { status:403 });
  }
}

async function handleUpload(req, env, ctx, headers) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") || "";
  if (!ALLOWED_PREFIXES.has(category)) return json({error:"Invalid category"},400,headers);
  if (!ctx.isAdmin && !SELF_SCOPED.has(category)) return json({error:"Admin access required"},403,headers);

  const original = req.headers.get("x-file-name") || url.searchParams.get("filename") || "file";
  const owner = ctx.isAdmin ? (url.searchParams.get("owner") || ctx.user.id) : ctx.user.id;
  const fileName = Date.now() + "-" + crypto.randomUUID() + "-" + safeName(original);
  const key = category + "/" + owner + "/" + fileName;
  authorizeKey(ctx,key,true);

  const contentType = req.headers.get("content-type") || "application/octet-stream";
  const size = Number(req.headers.get("content-length") || "0");
  if (size > 25 * 1024 * 1024) return json({error:"File exceeds 25 MB limit"},413,headers);

  await env.USG_FILES.put(key, req.body, {
    httpMetadata: { contentType },
    customMetadata: {
      uploadedBy: ctx.user.id,
      originalName: original,
      uploadedAt: new Date().toISOString()
    }
  });

  return json({ok:true,key,category,owner,original_name:original,content_type:contentType},201,headers);
}

async function handleGet(req, env, ctx, key, headers) {
  authorizeKey(ctx,key,false);
  const obj = await env.USG_FILES.get(key);
  if (!obj) return json({error:"File not found"},404,headers);
  const h = new Headers(headers);
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("Cache-Control","private, no-store");
  h.set("Content-Disposition",'inline; filename="' + safeName(obj.customMetadata?.originalName || key.split("/").pop()) + '"');
  return new Response(obj.body,{status:200,headers:h});
}

async function handleHead(env, ctx, key, headers) {
  authorizeKey(ctx,key,false);
  const obj = await env.USG_FILES.head(key);
  if (!obj) return json({error:"File not found"},404,headers);
  return json({ok:true,key,size:obj.size,etag:obj.etag,httpEtag:obj.httpEtag,uploaded:obj.uploaded,customMetadata:obj.customMetadata},200,headers);
}

async function handleDelete(env, ctx, key, headers) {
  authorizeKey(ctx,key,true);
  await env.USG_FILES.delete(key);
  return json({ok:true,deleted:key},200,headers);
}

async function handleList(req, env, ctx, headers) {
  if (!ctx.isAdmin) return json({error:"Admin access required"},403,headers);
  const url = new URL(req.url);
  const prefix = url.searchParams.get("prefix") || "";
  if (prefix && !Array.from(ALLOWED_PREFIXES).some(x=>prefix===x || prefix.startsWith(x+"/"))) {
    return json({error:"Invalid prefix"},400,headers);
  }
  const listed = await env.USG_FILES.list({prefix,limit:Math.min(Number(url.searchParams.get("limit")||100),1000),cursor:url.searchParams.get("cursor")||undefined});
  return json({
    ok:true,
    objects:listed.objects.map(o=>({key:o.key,size:o.size,etag:o.etag,uploaded:o.uploaded,customMetadata:o.customMetadata})),
    truncated:listed.truncated,
    cursor:listed.truncated?listed.cursor:null
  },200,headers);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const headers = cors(origin, env.ALLOWED_ORIGIN || "*");
    if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
    const url = new URL(req.url);

    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        return json({ok:true,service:"palsu-balabac-usg-files",r2:Boolean(env.USG_FILES)},200,headers);
      }

      const ctx = await auth(req);

      if (url.pathname === "/api/files/upload" && req.method === "POST") {
        return await handleUpload(req,env,ctx,headers);
      }

      if (url.pathname === "/api/files/list" && req.method === "GET") {
        return await handleList(req,env,ctx,headers);
      }

      const m = url.pathname.match(/^\/api\/files\/(.+)$/);
      if (m) {
        const key = decodeURIComponent(m[1]);
        if (req.method === "GET") return await handleGet(req,env,ctx,key,headers);
        if (req.method === "HEAD") return await handleHead(env,ctx,key,headers);
        if (req.method === "DELETE") return await handleDelete(env,ctx,key,headers);
      }

      return json({error:"Not found"},404,headers);
    } catch(e) {
      return json({error:e.message || String(e)},e.status || 500,headers);
    }
  }
};
