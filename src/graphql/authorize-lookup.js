import { query } from '../lib/database';

const OWNER_SQL = {
  event: 'SELECT organizer_id, original_organizer_id FROM event WHERE id = ?',
  poll: `SELECT e.organizer_id, e.original_organizer_id FROM poll p
         INNER JOIN event e ON e.id = p.event_id WHERE p.id = ?`,
  pollResult: `SELECT e.organizer_id, e.original_organizer_id FROM poll_result r
               INNER JOIN poll p ON p.id = r.poll_id
               INNER JOIN event e ON e.id = p.event_id WHERE r.id = ?`,
  eventUser: `SELECT e.organizer_id, e.original_organizer_id FROM event_user u
              INNER JOIN event e ON e.id = u.event_id WHERE u.id = ?`,
  zoomMeeting: 'SELECT organizer_id FROM zoom_meeting WHERE id = ?',
  jitsiMeeting: 'SELECT organizer_id FROM jitsi_meeting WHERE id = ?',
};

export async function lookup(kind, id) {
  if (kind === 'isSuperOrganizer') {
    const rows = await query('SELECT super_admin FROM organizer WHERE id = ?', [id]);
    return Boolean(rows?.[0]?.superAdmin);
  }
  const rows = await query(OWNER_SQL[kind], [id]);
  const row = rows?.[0];
  return row ? [row.organizerId, row.originalOrganizerId].filter(Boolean) : [];
}
