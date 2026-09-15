export function groupAttendanceSessions(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = String(row.event_id || `${row.event_name}|${row.event_starts_at}`);
    const group = groups.get(key) || { base: row, sessions: [] };
    group.sessions.push(row);
    groups.set(key, group);
  });
  return [...groups.values()].map(({ base, sessions }) => {
    sessions.sort((left, right) => new Date(left.time_in) - new Date(right.time_in));
    const first = sessions[0];
    const second = sessions[1];
    return {
      ...base,
      session_id: first.session_id,
      time_in: first.time_in,
      time_out: sessions.some((session) => !session.time_out) ? null : sessions[sessions.length - 1].time_out,
      first_time_in: first.time_in,
      first_time_out: first.time_out,
      second_time_in: second?.time_in || null,
      second_time_out: second?.time_out || null,
      total_seconds: sessions.reduce((total, session) => total + Number(session.total_seconds || 0), 0),
      session_count: sessions.length,
    };
  }).sort((left, right) => new Date(right.first_time_in) - new Date(left.first_time_in));
}
