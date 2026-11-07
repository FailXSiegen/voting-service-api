import { query } from '../../lib/database';

// no-console-check

export async function findByPollResultId(pollResultId) {
  const result = await query(
    'SELECT poll_user_voted.*, event_user.public_name AS publicName FROM poll_user_voted INNER JOIN event_user ON event_user.id = poll_user_voted.event_user_id WHERE poll_user_voted.poll_result_id = ?',
    [pollResultId]
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Gets the current vote cycle for a user in a specific poll result
 * @param {number} pollResultId
 * @param {number} eventUserId
 * @returns {Promise<{voteCycle: number}|null>}
 */
export async function getUserVoteCycle(pollResultId, eventUserId) {
  try {
    const result = await query(
      `
      SELECT vote_cycle as voteCycle 
      FROM poll_user_voted
      WHERE poll_result_id = ? AND event_user_id = ?
      ORDER BY vote_cycle DESC
      LIMIT 1
      `,
      [pollResultId, eventUserId]
    );

    if (Array.isArray(result) && result.length > 0) {
      return result[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error(
      `[ERROR] getUserVoteCycle: Fehler bei Abfrage für pollResultId=${pollResultId}, eventUserId=${eventUserId}:`,
      error
    );
    return null;
  }
}
