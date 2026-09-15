-- PSU Balabac USG Attendance Portal
-- Run this complete migration in the Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('admin', 'student')),
  student_number text unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  suffix text,
  program text check (program in ('BEEd', 'BSE', 'BSA')),
  account_status text not null default 'pending' check (account_status in ('pending', 'active', 'inactive')),
  must_change_password boolean not null default true,
  date_of_birth date,
  address text,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_path text,
  id_front_path text,
  id_back_path text,
  privacy_notice_accepted_at timestamptz,
  last_profile_update_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_fields_required check (
    role <> 'student' or (
      student_number is not null and btrim(student_number) <> '' and program is not null
    )
  )
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  venue text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_access_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code_hash text not null unique,
  version integer not null default 1,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.scanner_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  access_code_id uuid not null references public.event_access_codes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  time_in timestamptz not null,
  time_out timestamptz,
  time_in_received_at timestamptz not null default now(),
  time_out_received_at timestamptz,
  time_in_request_id text not null unique,
  time_out_request_id text unique,
  time_in_scanner_session uuid references public.scanner_sessions(id),
  time_out_scanner_session uuid references public.scanner_sessions(id),
  time_in_offline boolean not null default false,
  time_out_offline boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_time_order check (time_out is null or time_out >= time_in),
  constraint void_reason_required check (voided_at is null or length(btrim(void_reason)) >= 5)
);

create unique index if not exists one_open_attendance_session
  on public.attendance_sessions(event_id, student_id)
  where time_out is null and voided_at is null;

create index if not exists attendance_by_student
  on public.attendance_sessions(student_id, time_in desc)
  where voided_at is null;

create index if not exists attendance_by_event
  on public.attendance_sessions(event_id, time_in desc)
  where voided_at is null;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists attendance_touch_updated_at on public.attendance_sessions;
create trigger attendance_touch_updated_at before update on public.attendance_sessions
for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and account_status = 'active'
  );
$$;

create or replace view public.attendance_report
with (security_invoker = true)
as
select
  a.id as session_id,
  a.student_id,
  p.student_number,
  concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name, nullif(p.suffix, '')) as student_name,
  p.program,
  a.event_id,
  e.name as event_name,
  e.venue,
  e.starts_at as event_starts_at,
  a.time_in,
  a.time_out,
  case when a.time_out is not null then floor(extract(epoch from (a.time_out - a.time_in)))::bigint else 0 end as total_seconds,
  a.time_in_offline,
  a.time_out_offline,
  a.voided_at,
  a.void_reason
from public.attendance_sessions a
join public.profiles p on p.id = a.student_id
join public.events e on e.id = a.event_id;

create or replace view public.event_overview
with (security_invoker = true)
as
select
  e.id,
  e.name,
  e.venue,
  e.starts_at,
  e.ends_at,
  e.status,
  count(distinct a.student_id) filter (where a.voided_at is null) as total_count,
  count(distinct a.student_id) filter (where a.voided_at is null and p.program = 'BEEd') as beed_count,
  count(distinct a.student_id) filter (where a.voided_at is null and p.program = 'BSE') as bse_count,
  count(distinct a.student_id) filter (where a.voided_at is null and p.program = 'BSA') as bsa_count,
  max(c.expires_at) filter (where c.revoked_at is null) as code_expires_at
from public.events e
left join public.attendance_sessions a on a.event_id = e.id
left join public.profiles p on p.id = a.student_id
left join public.event_access_codes c on c.event_id = e.id
group by e.id;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_access_codes enable row level security;
alter table public.scanner_sessions enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_student_update_own on public.profiles;
create policy profiles_student_update_own on public.profiles
for update to authenticated
using (id = auth.uid() and role = 'student' and account_status <> 'inactive')
with check (id = auth.uid() and role = 'student' and account_status <> 'inactive');

drop policy if exists events_authenticated_read on public.events;
create policy events_authenticated_read on public.events
for select to authenticated using (true);

drop policy if exists events_admin_all on public.events;
create policy events_admin_all on public.events
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists attendance_select_own_or_admin on public.attendance_sessions;
create policy attendance_select_own_or_admin on public.attendance_sessions
for select to authenticated
using (student_id = auth.uid() or public.is_admin());

drop policy if exists event_codes_admin_read on public.event_access_codes;
create policy event_codes_admin_read on public.event_access_codes
for select to authenticated using (public.is_admin());

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
for select to authenticated using (public.is_admin());

revoke all on public.event_access_codes from anon, authenticated;
revoke all on public.scanner_sessions from anon, authenticated;
revoke insert, update, delete on public.attendance_sessions from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles, public.events, public.attendance_sessions, public.attendance_report, public.event_overview to authenticated;
grant select on public.event_access_codes to authenticated;
grant update(date_of_birth, address, phone, emergency_contact_name, emergency_contact_phone,
  photo_path, id_front_path, id_back_path, privacy_notice_accepted_at, last_profile_update_at)
  on public.profiles to authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.random_code(code_length integer default 8)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  bytes bytea := gen_random_bytes(greatest(8, code_length));
  i integer;
begin
  for i in 0..code_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.create_event(
  p_name text,
  p_venue text,
  p_starts_at timestamptz,
  p_code_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
  v_code text := public.random_code(8);
  v_access public.event_access_codes;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_code_expires_at <= now() then raise exception 'EXPIRY_MUST_BE_FUTURE'; end if;
  insert into public.events(name, venue, starts_at, created_by)
  values (btrim(p_name), btrim(coalesce(p_venue, '')), p_starts_at, auth.uid()) returning * into v_event;
  insert into public.event_access_codes(event_id, code_hash, expires_at, created_by)
  values (v_event.id, encode(digest(v_code, 'sha256'), 'hex'), p_code_expires_at, auth.uid())
  returning * into v_access;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'event.created', 'event', v_event.id::text, jsonb_build_object('name', v_event.name));
  return jsonb_build_object(
    'event', jsonb_build_object('id', v_event.id, 'name', v_event.name, 'venue', v_event.venue, 'startsAt', v_event.starts_at),
    'controlCode', v_code,
    'expiresAt', v_access.expires_at
  );
end;
$$;

create or replace function public.rotate_event_code(p_event_id uuid, p_code_expires_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
  v_code text := public.random_code(8);
  v_expiry timestamptz := coalesce(p_code_expires_at, now() + interval '8 hours');
  v_version integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_event from public.events where id = p_event_id and status = 'active';
  if not found then raise exception 'ACTIVE_EVENT_NOT_FOUND'; end if;
  update public.event_access_codes set revoked_at = now() where event_id = p_event_id and revoked_at is null;
  update public.scanner_sessions set revoked_at = now() where event_id = p_event_id and revoked_at is null;
  select coalesce(max(version), 0) + 1 into v_version from public.event_access_codes where event_id = p_event_id;
  insert into public.event_access_codes(event_id, code_hash, version, expires_at, created_by)
  values (p_event_id, encode(digest(v_code, 'sha256'), 'hex'), v_version, v_expiry, auth.uid());
  insert into public.audit_log(actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'event.code_rotated', 'event', p_event_id::text);
  return jsonb_build_object('event', jsonb_build_object('id', v_event.id, 'name', v_event.name, 'venue', v_event.venue), 'controlCode', v_code, 'expiresAt', v_expiry);
end;
$$;

create or replace function public.end_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.events set status = 'ended', ends_at = now() where id = p_event_id and status = 'active';
  if not found then raise exception 'ACTIVE_EVENT_NOT_FOUND'; end if;
  update public.event_access_codes set revoked_at = now() where event_id = p_event_id and revoked_at is null;
  update public.scanner_sessions set revoked_at = now() where event_id = p_event_id and revoked_at is null;
  insert into public.audit_log(actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'event.ended', 'event', p_event_id::text);
  return jsonb_build_object('ended', true, 'eventId', p_event_id);
end;
$$;

create or replace function public.exchange_scanner_code(p_control_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_control_code, ''), '[^A-Z0-9]', '', 'g'));
  v_access public.event_access_codes;
  v_event public.events;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_expires timestamptz;
begin
  select c.* into v_access
  from public.event_access_codes c
  join public.events e on e.id = c.event_id
  where c.code_hash = encode(digest(v_code, 'sha256'), 'hex')
    and c.revoked_at is null and c.expires_at > now() and e.status = 'active'
  order by c.created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'code', 'INVALID_CONTROL_CODE', 'message', 'The control code is invalid or expired.'); end if;
  select * into v_event from public.events where id = v_access.event_id;
  v_expires := least(v_access.expires_at, now() + interval '8 hours');
  insert into public.scanner_sessions(event_id, access_code_id, token_hash, expires_at)
  values (v_event.id, v_access.id, encode(digest(v_token, 'sha256'), 'hex'), v_expires);
  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expiresAt', v_expires,
    'event', jsonb_build_object('id', v_event.id, 'name', v_event.name, 'venue', v_event.venue, 'startsAt', v_event.starts_at)
  );
end;
$$;

create or replace function public.valid_scanner_session(p_token text)
returns public.scanner_sessions
language sql
security definer
set search_path = public, pg_temp
as $$
  select s.* from public.scanner_sessions s
  join public.events e on e.id = s.event_id
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.revoked_at is null and s.expires_at > now() and e.status = 'active'
  limit 1;
$$;

create or replace function public.record_attendance(
  p_scanner_token text,
  p_student_number text,
  p_mode text,
  p_request_id text,
  p_device_scanned_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scanner public.scanner_sessions;
  v_student public.profiles;
  v_record public.attendance_sessions;
  v_mode text := lower(replace(coalesce(p_mode, ''), ' ', ''));
  v_now timestamptz := now();
  v_when timestamptz;
  v_offline boolean := false;
begin
  select * into v_scanner from public.valid_scanner_session(p_scanner_token);
  if v_scanner.id is null then return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'message', 'Scanner access expired. Enter the current control code.'); end if;
  if length(coalesce(p_request_id, '')) < 8 or length(p_request_id) > 128 then return jsonb_build_object('ok', false, 'code', 'BAD_REQUEST_ID', 'message', 'The scan request is invalid.'); end if;
  select * into v_student from public.profiles
  where upper(regexp_replace(student_number, '[[:space:]]+', '', 'g')) = upper(regexp_replace(coalesce(p_student_number, ''), '[[:space:]]+', '', 'g'))
    and role = 'student' and account_status <> 'inactive';
  if not found then return jsonb_build_object('ok', false, 'code', 'STUDENT_NOT_FOUND', 'message', 'This student is not enrolled or the account is inactive.'); end if;

  select * into v_record from public.attendance_sessions
  where time_in_request_id = p_request_id or time_out_request_id = p_request_id limit 1;
  if found then
    return jsonb_build_object('ok', true, 'duplicateRequest', true, 'attendanceAction', case when v_record.time_out_request_id = p_request_id then 'Time Out' else 'Time In' end,
      'recordedAt', case when v_record.time_out_request_id = p_request_id then v_record.time_out else v_record.time_in end,
      'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number,
        'name', concat_ws(' ', v_student.first_name, nullif(v_student.middle_name, ''), v_student.last_name, nullif(v_student.suffix, '')), 'program', v_student.program));
  end if;

  if p_device_scanned_at is not null and p_device_scanned_at between v_now - interval '24 hours' and v_now + interval '5 minutes' then
    v_when := p_device_scanned_at;
    v_offline := abs(extract(epoch from (v_now - p_device_scanned_at))) > 120;
  else
    v_when := v_now;
  end if;

  if v_mode in ('timein', 'in') then
    select * into v_record from public.attendance_sessions
    where event_id = v_scanner.event_id and student_id = v_student.id and time_out is null and voided_at is null
    for update;
    if found then return jsonb_build_object('ok', false, 'code', 'ALREADY_TIMED_IN', 'message', 'This student already has an open Time In. Select Time Out when the student leaves.'); end if;
    begin
      insert into public.attendance_sessions(event_id, student_id, time_in, time_in_request_id, time_in_scanner_session, time_in_offline)
      values (v_scanner.event_id, v_student.id, v_when, p_request_id, v_scanner.id, v_offline) returning * into v_record;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_TIMED_IN', 'message', 'This student already has an open Time In.');
    end;
  elsif v_mode in ('timeout', 'out') then
    select * into v_record from public.attendance_sessions
    where event_id = v_scanner.event_id and student_id = v_student.id and time_out is null and voided_at is null
    order by time_in desc limit 1 for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_TIMED_IN', 'message', 'Time Out requires an open Time In for this event.'); end if;
    if v_when < v_record.time_in then v_when := v_now; v_offline := false; end if;
    update public.attendance_sessions set time_out = v_when, time_out_received_at = v_now,
      time_out_request_id = p_request_id, time_out_scanner_session = v_scanner.id, time_out_offline = v_offline
    where id = v_record.id returning * into v_record;
  else
    return jsonb_build_object('ok', false, 'code', 'BAD_ATTENDANCE_MODE', 'message', 'Choose Time In or Time Out.');
  end if;

  update public.scanner_sessions set last_used_at = v_now where id = v_scanner.id;
  return jsonb_build_object(
    'ok', true,
    'modeApplied', true,
    'attendanceMode', case when v_mode in ('timein', 'in') then 'timeIn' else 'timeOut' end,
    'attendanceAction', case when v_mode in ('timein', 'in') then 'Time In' else 'Time Out' end,
    'recordedAt', v_when,
    'offlineQueued', v_offline,
    'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number,
      'name', concat_ws(' ', v_student.first_name, nullif(v_student.middle_name, ''), v_student.last_name, nullif(v_student.suffix, '')), 'program', v_student.program)
  );
end;
$$;

create or replace function public.scanner_student_history(p_scanner_token text, p_student_number text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scanner public.scanner_sessions;
  v_student public.profiles;
  v_history jsonb;
begin
  select * into v_scanner from public.valid_scanner_session(p_scanner_token);
  if v_scanner.id is null then return jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED', 'message', 'Scanner access expired.'); end if;
  select * into v_student from public.profiles where upper(student_number) = upper(btrim(p_student_number)) and role = 'student';
  if not found then return jsonb_build_object('ok', false, 'code', 'STUDENT_NOT_FOUND', 'message', 'Student not found.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sessionId', r.session_id, 'eventName', r.event_name, 'venue', r.venue,
    'eventDate', to_char(r.event_starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    'attendanceDate', to_char(r.time_in at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    'firstTimeIn', r.time_in, 'firstTimeOut', r.time_out,
    'secondTimeIn', null, 'secondTimeOut', null,
    'totalSeconds', r.total_seconds,
    'totalTime', to_char(make_interval(secs => r.total_seconds::int), 'HH24:MI:SS')
  ) order by r.time_in desc), '[]'::jsonb) into v_history
  from public.attendance_report r where r.student_id = v_student.id and r.voided_at is null;
  return jsonb_build_object('ok', true,
    'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_number,
      'name', concat_ws(' ', v_student.first_name, nullif(v_student.middle_name, ''), v_student.last_name, nullif(v_student.suffix, '')), 'program', v_student.program),
    'history', v_history);
end;
$$;

create or replace function public.correct_attendance(p_session_id uuid, p_operation text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.attendance_sessions;
  v_operation text := lower(btrim(p_operation));
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  select * into v_before from public.attendance_sessions where id = p_session_id for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND'; end if;
  if v_operation = 'void' then
    update public.attendance_sessions set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = p_session_id;
  elsif v_operation = 'remove_time_out' then
    if v_before.time_out is null then raise exception 'TIME_OUT_NOT_FOUND'; end if;
    if exists (select 1 from public.attendance_sessions where event_id = v_before.event_id and student_id = v_before.student_id and id <> p_session_id and time_out is null and voided_at is null) then
      raise exception 'ANOTHER_OPEN_SESSION_EXISTS';
    end if;
    update public.attendance_sessions set time_out = null, time_out_received_at = null, time_out_request_id = null,
      time_out_scanner_session = null, time_out_offline = false where id = p_session_id;
  elsif v_operation = 'restore' then
    if v_before.voided_at is null then raise exception 'ATTENDANCE_NOT_VOIDED'; end if;
    if v_before.time_out is null and exists (select 1 from public.attendance_sessions where event_id = v_before.event_id and student_id = v_before.student_id and id <> p_session_id and time_out is null and voided_at is null) then
      raise exception 'ANOTHER_OPEN_SESSION_EXISTS';
    end if;
    update public.attendance_sessions set voided_at = null, voided_by = null, void_reason = null where id = p_session_id;
  else
    raise exception 'BAD_CORRECTION_OPERATION';
  end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'attendance.' || v_operation, 'attendance_session', p_session_id::text,
    jsonb_build_object('reason', btrim(p_reason), 'before', to_jsonb(v_before)));
  return jsonb_build_object('ok', true, 'sessionId', p_session_id, 'operation', v_operation);
end;
$$;

revoke all on function public.touch_updated_at() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.random_code(integer) from public;
revoke all on function public.valid_scanner_session(text) from public;
revoke all on function public.create_event(text, text, timestamptz, timestamptz) from public;
revoke all on function public.rotate_event_code(uuid, timestamptz) from public;
revoke all on function public.end_event(uuid) from public;
revoke all on function public.correct_attendance(uuid, text, text) from public;
revoke all on function public.exchange_scanner_code(text) from public;
revoke all on function public.record_attendance(text, text, text, text, timestamptz) from public;
revoke all on function public.scanner_student_history(text, text) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.create_event(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.rotate_event_code(uuid, timestamptz) to authenticated;
grant execute on function public.end_event(uuid) to authenticated;
grant execute on function public.correct_attendance(uuid, text, text) to authenticated;
grant execute on function public.exchange_scanner_code(text) to anon, authenticated;
grant execute on function public.record_attendance(text, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.scanner_student_history(text, text) to anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('student-photos', 'student-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('student-id-copies', 'student-id-copies', false, 10485760, array['image/png', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_assets_read on storage.objects;
create policy student_assets_read on storage.objects
for select to authenticated
using (
  bucket_id in ('student-photos', 'student-id-copies')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists student_assets_insert on storage.objects;
create policy student_assets_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('student-photos', 'student-id-copies')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists student_assets_update on storage.objects;
create policy student_assets_update on storage.objects
for update to authenticated
using (
  bucket_id in ('student-photos', 'student-id-copies')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('student-photos', 'student-id-copies')
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

-- After the migration, create the approved private USG administrator in
-- Authentication > Users. Then run the following with the actual user UUID:
-- insert into public.profiles(id, role, first_name, last_name, account_status, must_change_password)
-- values ('ADMIN_AUTH_USER_UUID', 'admin', 'USG', 'Administrator', 'active', false);
