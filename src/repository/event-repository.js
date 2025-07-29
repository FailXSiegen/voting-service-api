import { query, insert, update as updateQuery } from "./../lib/database";
import { getCurrentUnixTimeStamp } from "../lib/time-stamp";

export async function findById(id) {
  const result = await query(
    "SELECT * FROM event WHERE id = ? AND deleted = 0",
    [id],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findByIdAndOrganizerId(id, organizerId) {
  const result = await query(
    "SELECT * FROM event WHERE id = ?  AND organizer_id = ? AND deleted = 0",
    [id, organizerId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findByIdAndOrganizerIdIncludingOriginal(id, organizerId) {
  const result = await query(
    "SELECT * FROM event WHERE id = ? AND (organizer_id = ? OR original_organizer_id = ?) AND deleted = 0",
    [id, organizerId, organizerId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findOneBySlug(slug) {
  const result = await query(
    "SELECT * FROM event WHERE slug = ?  AND deleted = 0",
    [slug],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findByOrganizer(organizerId) {
  return await query(
    "SELECT * FROM event WHERE organizer_id = ?  AND deleted = 0",
    [organizerId],
  );
}

export async function findByOriginalOrganizer(organizerId) {
  return await query(
    "SELECT * FROM event WHERE original_organizer_id = ? AND organizer_id != ? AND deleted = 0",
    [organizerId, organizerId],
  );
}

export async function findEventIdByPollResultId(pollResultId) {
  const result = await query(
    "SELECT poll.event_id FROM poll INNER JOIN poll_result ON poll.id = poll_result.poll_id WHERE poll_result.id = ?",
    [pollResultId],
  );
  return Array.isArray(result) ? result[0].eventId || null : null;
}

export async function getMultivoteType(eventId) {
  const result = await query(
    "SELECT event.multivote_type FROM event WHERE event.id = ?",
    [eventId],
  );
  return Array.isArray(result) ? result[0].multivoteType : 1;
}

export async function eventIsActive(eventId) {
  const result = await query(
    "SELECT event.active FROM event WHERE event.id = ?",
    [eventId],
  );
  return Array.isArray(result) ? result[0].active === 1 : false;
}

export async function isAsyncEventStarted(eventId) {
  const result = await query(
    "SELECT async, scheduled_datetime FROM event WHERE id = ?",
    [eventId],
  );
  if (!Array.isArray(result) || result.length === 0) return true; // Default: allow
  
  const event = result[0];
  
  // Nur bei asynchronen Events das Startdatum prüfen
  if (event.async === 1) {
    const currentTimestamp = getCurrentUnixTimeStamp();
    return event.scheduledDatetime <= currentTimestamp;
  }
  
  // Normale Events: immer erlauben
  return true;
}

export async function findUpcoming(organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp();
  return await query(
    "SELECT * FROM event WHERE organizer_id = ? AND deleted = 0 AND scheduled_datetime > ?",
    [organizerId, currentTimestamp],
  );
}

export async function findUpcomingByOriginalOrganizer(organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp();
  return await query(
    "SELECT * FROM event WHERE original_organizer_id = ? AND organizer_id != ? AND deleted = 0 AND scheduled_datetime > ?",
    [organizerId, organizerId, currentTimestamp],
  );
}

export async function findExpired(organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp();
  return await query(
    "SELECT * FROM event WHERE organizer_id = ? AND deleted = 0 AND scheduled_datetime <= ?",
    [organizerId, currentTimestamp],
  );
}

export async function findExpiredByOriginalOrganizer(organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp();
  return await query(
    "SELECT * FROM event WHERE original_organizer_id = ? AND organizer_id != ? AND deleted = 0 AND scheduled_datetime <= ?",
    [organizerId, organizerId, currentTimestamp],
  );
}

export async function findAllUpcomingEvents() {
  const currentTimestamp = getCurrentUnixTimeStamp();
  return await query(
    "SELECT * FROM event WHERE event.deleted = 0 AND event.scheduled_datetime > ? ORDER BY event.scheduled_datetime ASC",
    [currentTimestamp],
  );
}

export async function findAllPastEvents(page, pageSize) {
  const currentTimestamp = getCurrentUnixTimeStamp();
  const offset = page * pageSize;
  return await query(
    "SELECT * FROM event WHERE event.deleted = 0 AND event.scheduled_datetime <= ? ORDER BY event.scheduled_datetime ASC LIMIT ? OFFSET ?",
    [currentTimestamp, pageSize, offset],
  );
}
export async function findAllExpired() {
  const timestampExpired = Math.floor(Date.now() / 1000 - 60 * 60 * 24 * 180);
  return await query(
    "SELECT organizer_id, title FROM event WHERE scheduled_datetime <= ? AND delete_planned = 0 AND delete_datetime = 0",
    [timestampExpired],
  );
}
export async function markToDelete() {
  const timestampExpired = Math.floor(Date.now() / 1000 - 60 * 60 * 24 * 180);
  const timestampToDelete = Math.floor(Date.now() / 1000 + 60 * 60 * 24 * 3);
  return await query(
    "UPDATE event SET delete_planned = 1, delete_datetime = ? WHERE scheduled_datetime <= ? AND delete_planned = 0",
    [timestampToDelete, timestampExpired],
  );
}

export async function findAllMarkedDelete() {
  const currentTimestamp = getCurrentUnixTimeStamp();
  return await query(
    "SELECT id, organizer_id FROM event WHERE delete_planned = 1 AND delete_datetime <= ?",
    [currentTimestamp],
  );
}

export async function findAllUnfinishedPassedAsyncEvents() {
  return await query(
    "SELECT * FROM event WHERE async = 1 AND deleted = 0 AND finished = 0 AND end_datetime <= ? ORDER BY end_datetime ASC",
    [getCurrentUnixTimeStamp()],
  );
}

export async function create(input) {
  const currentTime = getCurrentUnixTimeStamp();
  input.createDatetime = currentTime;
  input.modifiedDatetime = currentTime;
  await insert("event", input);
}

export async function update(input) {
  // First check if the user is authorized to update this event
  // We need to verify if they are either the current organizer or the original organizer
  const event = await query(
    "SELECT * FROM event WHERE id = ? AND deleted = 0",
    [input.id]
  );
  
  if (!event || event.length === 0) {
    throw new Error("Event not found");
  }
  
  const eventData = event[0];
  const organizerId = input.organizerId;
  
  // If organizerId is not provided in input, or matches the event's organizer_id,
  // or matches the original_organizer_id, then allow the update
  if (
    !organizerId ||
    parseInt(organizerId) === parseInt(eventData.organizerId) ||
    (eventData.originalOrganizerId && parseInt(organizerId) === parseInt(eventData.originalOrganizerId))
  ) {
    input.modifiedDatetime = getCurrentUnixTimeStamp();
    await updateQuery("event", input);
  } else {
    throw new Error("Not authorized to update this event");
  }
}

export async function transferToOrganizer(eventId, newOrganizerId) {
  const event = await findById(eventId);

  if (!event) {
    return null;
  }

  // Only set original_organizer_id if it hasn't been set yet
  const originalOrganizerId = event.originalOrganizerId || event.organizerId;

  await query(
    "UPDATE event SET organizer_id = ?, original_organizer_id = ?, modified_datetime = ? WHERE id = ?",
    [newOrganizerId, originalOrganizerId, getCurrentUnixTimeStamp(), eventId]
  );

  return await findById(eventId);
}

export async function resetToOriginalOrganizer(eventId) {
  const event = await findById(eventId);

  if (!event || !event.originalOrganizerId) {
    return null;
  }

  await query(
    "UPDATE event SET organizer_id = ?, original_organizer_id = NULL, modified_datetime = ? WHERE id = ?",
    [event.originalOrganizerId, getCurrentUnixTimeStamp(), eventId]
  );

  return await findById(eventId);
}

/**
 * Entfernt ein Event und alle zugehörigen Daten
 * @param {number} organizerId - ID des Organisators
 * @param {number} id - ID des Events
 * @returns {Promise<boolean>} - true bei Erfolg
 */
export async function remove(organizerId, id) {
  // First check if the organizer has rights to remove the event
  const event = await query(
    "SELECT * FROM event WHERE id = ? AND (organizer_id = ? OR original_organizer_id = ?) AND deleted = 0",
    [id, organizerId, organizerId]
  );
  
  if (!event || event.length === 0) {
    return false;
  }
  
  // 1. Lösche poll_user_voted Einträge
  await query(
    `DELETE poll_user_voted 
     FROM poll_user_voted 
     INNER JOIN poll_result ON poll_user_voted.poll_result_id = poll_result.id 
     INNER JOIN poll ON poll_result.poll_id = poll.id 
     INNER JOIN event ON poll.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 2. Lösche poll_possible_answer Einträge
  await query(
    `DELETE poll_possible_answer 
     FROM poll_possible_answer 
     INNER JOIN poll ON poll_possible_answer.poll_id = poll.id 
     INNER JOIN event ON poll.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 3. Lösche poll_answer Einträge
  await query(
    `DELETE poll_answer 
     FROM poll_answer 
     INNER JOIN poll_result ON poll_answer.poll_result_id = poll_result.id 
     INNER JOIN poll ON poll_result.poll_id = poll.id 
     INNER JOIN event ON poll.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 4. Lösche poll_user Einträge
  await query(
    `DELETE poll_user 
     FROM poll_user 
     INNER JOIN poll ON poll_user.poll_id = poll.id 
     INNER JOIN event ON poll.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 5. Lösche poll_result Einträge
  await query(
    `DELETE poll_result 
     FROM poll_result 
     INNER JOIN poll ON poll_result.poll_id = poll.id 
     INNER JOIN event ON poll.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 6. Lösche poll Einträge
  await query(
    `DELETE poll 
     FROM poll 
     INNER JOIN event ON poll.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 7. Lösche event_user_auth_token Einträge
  await query(
    `DELETE euat 
     FROM event_user_auth_token euat
     INNER JOIN event_user ON euat.event_user_id = event_user.id 
     INNER JOIN event ON event_user.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 8. Lösche jwt_refresh_token Einträge
  await query(
    `DELETE jwt_refresh_token 
     FROM jwt_refresh_token 
     INNER JOIN event_user ON jwt_refresh_token.event_user_id = event_user.id 
     INNER JOIN event ON event_user.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 9. Lösche event_user Einträge
  await query(
    `DELETE event_user 
     FROM event_user 
     INNER JOIN event ON event_user.event_id = event.id 
     WHERE event.id = ?`,
    [id],
  );

  // 10. Lösche das Event selbst
  await query(
    `DELETE event 
     FROM event 
     WHERE event.id = ?`,
    [id],
  );

  return true;
}