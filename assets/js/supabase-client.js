const STUDENT_SESSION_KEY = "psu-usg-student-session";
let client;

export function supabaseConfig() {
  const config = window.USG_ATTENDANCE_CONFIG || {};
  return {
    url: String(config.supabaseUrl || "").trim(),
    key: String(config.supabasePublishableKey || "").trim(),
    adminEmail: String(config.adminEmail || "").trim(),
    studentEmailDomain: String(config.studentEmailDomain || "students.psubalabac.invalid").trim(),
  };
}

export function isSupabaseConfigured() {
  const { url, key } = supabaseConfig();
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.startsWith("sb_publishable_");
}

export function getSupabase() {
  if (client) return client;
  if (!isSupabaseConfigured()) throw new Error("The Supabase attendance database has not been configured yet.");
  if (!window.supabase?.createClient) throw new Error("The secure database library did not load. Refresh the page and check the internet connection.");
  const { url, key } = supabaseConfig();
  client = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export function normalizeStudentNumber(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function studentNumberToEmail(value) {
  const number = normalizeStudentNumber(value);
  if (!number) throw new Error("Enter your student number.");
  const local = number.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${local}@${supabaseConfig().studentEmailDomain}`;
}

export async function signInStudent(studentNumber, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: studentNumberToEmail(studentNumber), password });
  if (error) throw friendlyAuthError(error);
  sessionStorage.setItem(STUDENT_SESSION_KEY, normalizeStudentNumber(studentNumber));
  return data;
}

export async function signInAdmin(password, email = supabaseConfig().adminEmail) {
  if (!email) throw new Error("The USG administrator email is not configured.");
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw friendlyAuthError(error);
  const profile = await getOwnProfile();
  if (profile.role !== "admin" || profile.account_status !== "active") {
    await getSupabase().auth.signOut();
    throw new Error("This account does not have active USG administrator access.");
  }
  return { ...data, profile };
}

export async function getSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getOwnProfile() {
  const supabase = getSupabase();
  const session = await getSession();
  if (!session) throw Object.assign(new Error("Your session expired. Sign in again."), { code: "SESSION_EXPIRED" });
  const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) throw databaseError(error);
  return data;
}

export async function signOut() {
  sessionStorage.removeItem(STUDENT_SESSION_KEY);
  if (client) await client.auth.signOut();
}

export async function changeStudentPassword(newPassword) {
  const { data, error } = await getSupabase().functions.invoke("student-password", { body: { newPassword } });
  if (error) throw new Error(await functionErrorMessage(error));
  if (!data?.ok) throw new Error(data?.error || "The password could not be changed.");
  return data;
}

export async function updateStudentProfile(values) {
  const profile = await getOwnProfile();
  const allowed = {
    date_of_birth: values.dateOfBirth || null,
    address: clean(values.address, 300),
    phone: clean(values.phone, 30),
    emergency_contact_name: clean(values.emergencyContactName, 150),
    emergency_contact_phone: clean(values.emergencyContactPhone, 30),
    privacy_notice_accepted_at: values.acceptPrivacy ? new Date().toISOString() : profile.privacy_notice_accepted_at,
    last_profile_update_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabase().from("profiles").update(allowed).eq("id", profile.id).select("*").single();
  if (error) throw databaseError(error);
  return data;
}

export async function uploadStudentPhoto(file) {
  if (!file) throw new Error("Choose a photo first.");
  if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type)) throw new Error("Use a JPG, PNG or WebP photo.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The photo must be 5 MB or smaller.");
  const profile = await getOwnProfile();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${profile.id}/profile.${extension}`;
  const { error } = await getSupabase().storage.from("student-photos").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (error) throw databaseError(error);
  const { data, error: updateError } = await getSupabase().from("profiles").update({ photo_path: path, last_profile_update_at: new Date().toISOString() }).eq("id", profile.id).select("*").single();
  if (updateError) throw databaseError(updateError);
  return data;
}

export async function privateAssetUrl(bucket, path, expiresIn = 900) {
  if (!path) return "";
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw databaseError(error);
  return data.signedUrl;
}

export async function privateAssetUrls(bucket, paths, expiresIn = 900) {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  const urls = new Map();
  for (let offset = 0; offset < uniquePaths.length; offset += 100) {
    const batch = uniquePaths.slice(offset, offset + 100);
    const { data, error } = await getSupabase().storage.from(bucket).createSignedUrls(batch, expiresIn);
    if (error) throw databaseError(error);
    (data || []).forEach((item, index) => urls.set(item.path || batch[index], item.signedUrl || ""));
  }
  return urls;
}

export async function saveStudentIdCopy(side, blob) {
  if (!blob || !["front", "back"].includes(side)) throw new Error("The ID copy is invalid.");
  const profile = await getOwnProfile();
  const path = `${profile.id}/attendance-id-${side}.png`;
  const { error } = await getSupabase().storage.from("student-id-copies").upload(path, blob, { upsert: true, contentType: "image/png", cacheControl: "3600" });
  if (error) throw databaseError(error);
  const field = side === "front" ? "id_front_path" : "id_back_path";
  const { error: updateError } = await getSupabase().from("profiles").update({ [field]: path }).eq("id", profile.id);
  if (updateError) throw databaseError(updateError);
  return path;
}

export async function ownAttendanceReport() {
  const profile = await getOwnProfile();
  const { data, error } = await getSupabase().from("attendance_report").select("*").eq("student_id", profile.id).is("voided_at", null).order("time_in", { ascending: false });
  if (error) throw databaseError(error);
  return data || [];
}

export async function listStudents() {
  const { data, error } = await getSupabase().from("profiles")
    .select("id, student_number, first_name, middle_name, last_name, suffix, program, account_status, must_change_password, date_of_birth, address, phone, emergency_contact_name, emergency_contact_phone, photo_path, privacy_notice_accepted_at, updated_at")
    .eq("role", "student").order("last_name").order("first_name");
  if (error) throw databaseError(error);
  return data || [];
}

export async function administerStudent(body) {
  const { data, error } = await getSupabase().functions.invoke("admin-students", { body });
  if (error) throw new Error(await functionErrorMessage(error));
  if (!data?.ok) throw new Error(data?.error || "The student account action failed.");
  return data;
}

export function profileDisplayName(profile) {
  return [profile.first_name, formatMiddleName(profile.middle_name), profile.last_name, profile.suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function formatMiddleName(value) {
  const middleName = String(value || "").trim().replace(/\s+/g, " ");
  const initial = middleName.replace(/\.$/, "");
  return /^[A-Za-zÑñ]$/.test(initial) ? `${initial.toUpperCase()}.` : middleName;
}

function clean(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function friendlyAuthError(error) {
  const message = /invalid login credentials/i.test(error?.message || "")
    ? "The username or password is incorrect. Ask the USG to reset the account if needed."
    : error?.message || "Sign-in failed.";
  return Object.assign(new Error(message), { code: error?.code });
}

function databaseError(error) {
  if (/relation .* does not exist|schema cache/i.test(error?.message || "")) {
    return new Error("The Supabase database setup has not been applied yet. Ask the administrator to run the supplied migration.");
  }
  return new Error(error?.message || "The attendance database request failed.");
}

async function functionErrorMessage(error) {
  try {
    const response = error?.context;
    if (response?.clone) {
      const body = await response.clone().json();
      if (body?.error) return body.error;
    }
  } catch { /* Use the SDK message below. */ }
  return error?.message || "The secure account service could not be reached.";
}
