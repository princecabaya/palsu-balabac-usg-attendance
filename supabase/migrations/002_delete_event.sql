-- Administrator-only permanent event deletion.
-- Run once after 001_attendance_portal.sql on existing projects.

begin;

create or replace function public.delete_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
  v_attendance_count integer;
  v_code_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  select count(*)::integer into v_attendance_count
  from public.attendance_sessions
  where event_id = p_event_id;

  select count(*)::integer into v_code_count
  from public.event_access_codes
  where event_id = p_event_id;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'event.deleted',
    'event',
    p_event_id::text,
    jsonb_build_object(
      'name', v_event.name,
      'venue', v_event.venue,
      'startsAt', v_event.starts_at,
      'status', v_event.status,
      'attendanceRecords', v_attendance_count,
      'accessCodes', v_code_count
    )
  );

  -- Related access codes, scanner sessions and attendance rows use ON DELETE CASCADE.
  delete from public.events where id = p_event_id;

  return jsonb_build_object(
    'ok', true,
    'eventId', p_event_id,
    'eventName', v_event.name,
    'deletedAttendance', v_attendance_count
  );
end;
$$;

revoke all on function public.delete_event(uuid) from public;
grant execute on function public.delete_event(uuid) to authenticated;

commit;
