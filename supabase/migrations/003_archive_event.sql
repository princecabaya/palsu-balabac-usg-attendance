-- Non-destructive event archiving.
-- Archived events and their attendance remain stored, but are excluded from
-- the control event list, student histories and administrator reports.

begin;

alter table public.events
  add column if not exists is_archived boolean not null default false;

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
join public.events e on e.id = a.event_id
where not e.is_archived;

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
where not e.is_archived
group by e.id;

create or replace function public.archive_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
  v_attendance_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.is_archived then raise exception 'EVENT_ALREADY_ARCHIVED'; end if;

  select count(*)::integer into v_attendance_count
  from public.attendance_sessions
  where event_id = p_event_id;

  update public.events
  set is_archived = true,
      status = 'ended',
      ends_at = coalesce(ends_at, now())
  where id = p_event_id;

  update public.event_access_codes
  set revoked_at = coalesce(revoked_at, now())
  where event_id = p_event_id;

  update public.scanner_sessions
  set revoked_at = coalesce(revoked_at, now())
  where event_id = p_event_id;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'event.archived',
    'event',
    p_event_id::text,
    jsonb_build_object(
      'name', v_event.name,
      'venue', v_event.venue,
      'startsAt', v_event.starts_at,
      'previousStatus', v_event.status,
      'attendanceRecords', v_attendance_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'eventId', p_event_id,
    'eventName', v_event.name,
    'archivedAttendance', v_attendance_count
  );
end;
$$;

revoke all on function public.archive_event(uuid) from public;
grant execute on function public.archive_event(uuid) to authenticated;

commit;
