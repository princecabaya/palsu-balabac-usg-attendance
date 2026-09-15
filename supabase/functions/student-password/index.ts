import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "https://princecabaya.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Your sign-in session expired." }, 401);
    const body = await request.json();
    const password = String(body.newPassword || "");
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return json({ error: "Use at least 12 characters with uppercase, lowercase, a number and a symbol." }, 400);
    }
    const { data: profile } = await admin.from("profiles").select("student_number, role, account_status").eq("id", authData.user.id).single();
    if (!profile || profile.role !== "student" || profile.account_status === "inactive") return json({ error: "An active student account is required." }, 403);
    const compactPassword = password.toLowerCase().replace(/[^a-z0-9]/g, "");
    const compactNumber = String(profile.student_number || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compactNumber && compactPassword.includes(compactNumber)) return json({ error: "The password must not contain your student number." }, 400);
    const { error: updateError } = await admin.auth.admin.updateUserById(authData.user.id, { password });
    if (updateError) return json({ error: updateError.message }, 400);
    await admin.from("profiles").update({ must_change_password: false, account_status: "active" }).eq("id", authData.user.id);
    await admin.from("audit_log").insert({ actor_id: authData.user.id, action: "student.password_changed", entity_type: "profile", entity_id: authData.user.id });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
