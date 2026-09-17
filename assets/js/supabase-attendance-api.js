import { getSupabase, listStudents, normalizeStudentNumber, profileDisplayName, signInAdmin } from "./supabase-client.js";
import { groupAttendanceSessions } from "./attendance-report.js";

export function usesSupabaseBackend() {
  const requestedBackend = new URLSearchParams(location.search).get("backend");
  const pageBackend = document.body?.dataset.attendanceBackend;
  return requestedBackend === "supabase" || pageBackend === "supabase" || window.USG_ATTENDANCE_CONFIG?.backendMode === "supabase";
}

export async function supabaseAdminLogin(password) {
  const result = await signInAdmin(password);
  return {
    token: result.session.access_token,
    expiresAt: new Date((result.session.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000).toISOString(),
  };
}

export async function supabaseScannerLogin(code) {
  const { data, error } = await getSupabase().rpc("exchange_scanner_code", { p_control_code: code });
  if (error) throw apiError(error.message, error.code);
  return ensureOk(data);
}

export async function supabaseAction(action, params = {}) {
  const supabase = getSupabase();
  if (action === "health") return { ok: true, apiVersion: 4, configured: true, server: "Supabase", capabilities: { attendanceModes: true, separateStudentHistory: true, adminReports: true, studentAccounts: true, excelReports: true, auditedCorrections: true } };

  if (action === "students") {
    const rows = await listStudents();
    return { ok: true, students: rows.map((row) => ({ id: row.id, studentNumber: row.student_number, name: profileDisplayName(row), program: row.program, photoPath: row.photo_path, accountStatus: row.account_status })) };
  }

  if (action === "createEvent") {
    const startsAt = zonedInput(params.eventDate, params.startTime);
    const { data, error } = await supabase.rpc("create_event", { p_name: params.name, p_venue: params.venue, p_starts_at: startsAt, p_code_expires_at: zonedDateTime(params.expiresAt) });
    if (error) throw apiError(error.message, error.code);
    return {
      ok: true,
      event: dashboardEvent(data?.event),
      controlCode: data?.controlCode,
      expiresAt: data?.expiresAt,
    };
  }

  if (action === "listEvents") {
    const { data, error } = await supabase.from("event_overview").select("*").order("starts_at", { ascending: false });
    if (error) throw apiError(error.message, error.code);
    return { ok: true, events: (data || []).map((row) => ({
      eventNo: row.id, name: row.name, venue: row.venue, sheetName: "Supabase",
      eventDate: formatDate(row.starts_at), startTime: formatTime(row.starts_at), expiresAt: row.code_expires_at,
      status: String(row.status || "").toUpperCase(), counts: { BEEd: Number(row.beed_count || 0), BSE: Number(row.bse_count || 0), BSA: Number(row.bsa_count || 0), total: Number(row.total_count || 0) },
    })) };
  }

  if (action === "rotateCode") {
    const { data, error } = await supabase.rpc("rotate_event_code", { p_event_id: params.eventNo });
    if (error) throw apiError(error.message, error.code);
    return {
      ok: true,
      event: dashboardEvent(data?.event),
      controlCode: data?.controlCode,
      expiresAt: data?.expiresAt,
    };
  }

  if (action === "endEvent") {
    const { data, error } = await supabase.rpc("end_event", { p_event_id: params.eventNo });
    if (error) throw apiError(error.message, error.code);
    return { ok: true, ...data };
  }

  if (action === "scan") {
    const { data, error } = await supabase.rpc("record_attendance", {
      p_scanner_token: params.token,
      p_student_number: normalizeStudentNumber(params.studentNumber),
      p_mode: params.mode,
      p_request_id: params.requestId,
      p_device_scanned_at: params.scannedAt || new Date().toISOString(),
    });
    if (error) throw apiError(error.message, error.code);
    const result = ensureOk(data);
    return { ...result, timestamp: result.recordedAt };
  }

  if (action === "studentHistory") {
    const { data, error } = await supabase.rpc("scanner_student_history", { p_scanner_token: params.token, p_student_number: normalizeStudentNumber(params.studentNumber) });
    if (error) throw apiError(error.message, error.code);
    return ensureOk(data);
  }

  if (action === "studentReport") {
    const number = normalizeStudentNumber(params.studentNumber);
    const { data: student, error: studentError } = await supabase.from("profiles").select("id, student_number, first_name, middle_name, last_name, suffix, program").eq("student_number", number).eq("role", "student").single();
    if (studentError || !student) throw apiError("Student not found.", "STUDENT_NOT_FOUND");
    const { data: rows, error } = await supabase.from("attendance_report").select("*").eq("student_id", student.id).is("voided_at", null).order("time_in", { ascending: false });
    if (error) throw apiError(error.message, error.code);
    return { ok: true, student: { id: student.id, studentNumber: student.student_number, name: profileDisplayName(student), program: student.program }, history: groupAttendanceSessions(rows || []).map(reportRow) };
  }

  throw apiError("Unknown attendance action.", "UNKNOWN_ACTION");
}

function reportRow(row) {
  return {
    sessionId: row.session_id, eventName: row.event_name, venue: row.venue,
    eventDate: formatDate(row.event_starts_at), attendanceDate: formatDate(row.time_in),
    firstTimeIn: row.first_time_in || row.time_in, firstTimeOut: row.first_time_out ?? row.time_out,
    secondTimeIn: row.second_time_in || null, secondTimeOut: row.second_time_out || null,
    totalSeconds: Number(row.total_seconds || 0), totalTime: duration(row.total_seconds),
    offlineEntry: Boolean(row.time_in_offline || row.time_out_offline),
  };
}

function dashboardEvent(event = {}) {
  return {
    ...event,
    eventNo: event.id,
    sheetName: "Supabase",
  };
}

function ensureOk(data) {
  if (!data?.ok) throw apiError(data?.message || "The attendance request failed.", data?.code);
  return data;
}

function apiError(message, code) { return Object.assign(new Error(message || "The attendance database request failed."), { code }); }
function zonedInput(date, time) { return `${date}T${time}:00+08:00`; }
function zonedDateTime(value) { return value ? `${value}:00+08:00` : null; }
function formatDate(value) { return value ? new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" }).format(new Date(value)) : ""; }
function formatTime(value) { return value ? new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" }).format(new Date(value)) : ""; }
function duration(value) { const total = Math.max(0, Number(value) || 0); return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), Math.floor(total % 60)].map((part) => String(part).padStart(2, "0")).join(":"); }
