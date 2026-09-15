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

function normalizeStudentNumber(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function studentEmail(studentNumber: string) {
  const local = studentNumber.toLowerCase().replace(/[^a-z0-9]/g, "");
  const domain = Deno.env.get("STUDENT_EMAIL_DOMAIN") || "students.psubalabac.invalid";
  return `${local}@${domain}`;
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function cleanText(value: unknown, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sign in as a USG administrator." }, 401);
    const { data: caller } = await admin.from("profiles").select("role, account_status").eq("id", authData.user.id).single();
    if (caller?.role !== "admin" || caller.account_status !== "active") return json({ error: "Administrator access is required." }, 403);

    const body = await request.json();
    const action = cleanText(body.action, 30);
    const number = normalizeStudentNumber(body.studentNumber);
    if (!number) return json({ error: "Student number is required." }, 400);

    if (action === "enroll") {
      const firstName = cleanText(body.firstName, 80);
      const middleName = cleanText(body.middleName, 80);
      const lastName = cleanText(body.lastName, 80);
      const suffix = cleanText(body.suffix, 20);
      const program = cleanText(body.program, 10);
      if (!firstName || !lastName || !["BEEd", "BSE", "BSA"].includes(program)) {
        return json({ error: "Complete the student's name and choose a valid program." }, 400);
      }
      const password = temporaryPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: studentEmail(number),
        password,
        email_confirm: true,
        user_metadata: { student_number: number },
      });
      if (createError || !created.user) return json({ error: createError?.message || "The account could not be created." }, 400);
      const { error: profileError } = await admin.from("profiles").insert({
        id: created.user.id,
        role: "student",
        student_number: number,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix || null,
        program,
        account_status: "pending",
        must_change_password: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: profileError.message }, 400);
      }
      await admin.from("audit_log").insert({ actor_id: authData.user.id, action: "student.enrolled", entity_type: "profile", entity_id: created.user.id, details: { studentNumber: number } });
      return json({
        ok: true,
        username: number,
        temporaryPassword: password,
        message: "Copy or print this temporary password now. It is not stored and cannot be shown again.",
      });
    }

    const { data: profile, error: profileError } = await admin.from("profiles").select("id, student_number, account_status").eq("student_number", number).eq("role", "student").single();
    if (profileError || !profile) return json({ error: "Student account not found." }, 404);

    if (action === "resetPassword") {
      const password = temporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(profile.id, { password, ban_duration: "none" });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ must_change_password: true, account_status: "pending" }).eq("id", profile.id);
      await admin.from("audit_log").insert({ actor_id: authData.user.id, action: "student.password_reset", entity_type: "profile", entity_id: profile.id, details: { studentNumber: number } });
      return json({ ok: true, username: number, temporaryPassword: password, message: "The old password was replaced. Show this temporary password to the verified student once." });
    }

    if (action === "deactivate" || action === "reactivate") {
      const active = action === "reactivate";
      const { error } = await admin.auth.admin.updateUserById(profile.id, { ban_duration: active ? "none" : "876000h" });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ account_status: active ? "active" : "inactive" }).eq("id", profile.id);
      await admin.from("audit_log").insert({ actor_id: authData.user.id, action: `student.${action}`, entity_type: "profile", entity_id: profile.id, details: { studentNumber: number } });
      return json({ ok: true, accountStatus: active ? "active" : "inactive" });
    }

    return json({ error: "Unknown account action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
