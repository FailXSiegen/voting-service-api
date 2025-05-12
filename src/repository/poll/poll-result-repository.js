import {
  insert,
  update as updateQuery,
  remove as removeQuery,
  query,
} from "./../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

export async function findOneById(id) {
  const result = await query("SELECT * FROM poll_result WHERE id = ?", [id]);
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findOneByPollId(pollId) {
  try {
    // Nehmen wir den aktiven (neuesten) poll_result für diesen Poll
    const result = await query(
      `SELECT * FROM poll_result 
       WHERE poll_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [pollId]
    );
    return Array.isArray(result) && result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error(`[ERROR] findOneByPollId: Fehler bei Abfrage für poll_id=${pollId}:`, error);
    return null;
  }
}

export async function updatePollResultMaxVotes(pollResultId, eventUserId) {
  const maxVotes = await query(
    "SELECT vote_amount FROM event_user WHERE id = ?",
    [eventUserId],
  );
  if (!Array.isArray(maxVotes) || maxVotes[0].voteAmount === 0) {
    return false;
  }
  await query(
    "UPDATE poll_result SET max_votes = max_votes + ?,  max_vote_cycles = max_vote_cycles + ? WHERE id = ?",
    [maxVotes[0].voteAmount, maxVotes[0].voteAmount, pollResultId],
  );
  return true;
}

export async function findClosedPollResults(eventId, page, pageSize) {
  const offset = page * pageSize;
  return await query(
    `
    SELECT poll_result.*
    FROM poll_result
    INNER JOIN poll ON poll.id = poll_result.poll_id
    WHERE poll.event_id = ?
    AND poll_result.closed = ?
    ORDER BY create_datetime DESC
    LIMIT ? OFFSET ?
  `,
    [eventId, true, pageSize, offset],
  );
}

/**
 * Überprüft, ob in der aktuellen Abstimmung noch Stimmen abgegeben werden können
 * Berücksichtigt sowohl die Gesamtzahl der möglichen Stimmen als auch die tatsächlich abgegebenen Stimmen
 * @param {number} pollResultId - ID des Abstimmungsergebnisses
 * @returns {Promise<Object|null>} - Informationen zu verbleibenden Stimmen oder null wenn keine mehr übrig
 */
export async function findLeftAnswersCount(pollResultId) {
  try {
    // Start transaction to ensure consistent read
    await query("START TRANSACTION");

    try {
      // Fetch poll_result info with lock
      const pollInfo = await query(
        `SELECT id, max_votes AS maxVotes, max_vote_cycles AS maxVoteCycles, poll_id AS pollId, closed
         FROM poll_result 
         WHERE id = ? 
         FOR UPDATE`,
        [pollResultId]
      );

      if (!Array.isArray(pollInfo) || pollInfo.length === 0) {
        await query("COMMIT");
        return null;
      }

      const maxVotes = parseInt(pollInfo[0].maxVotes, 10) || 0;
      const maxVoteCycles = parseInt(pollInfo[0].maxVoteCycles, 10) || 0;
      const pollId = pollInfo[0].pollId;
      const isClosed = pollInfo[0].closed === 1;

      // If poll is already marked as closed, return null
      if (isClosed) {
        await query("COMMIT");
        return null;
      }

      // Count total answers (votes cast)
      const answerCountQuery = await query(
        `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ?`,
        [pollResultId]
      );

      const totalAnswers = Array.isArray(answerCountQuery) && answerCountQuery.length > 0
        ? parseInt(answerCountQuery[0].total, 10) || 0
        : 0;

      // Get total vote cycles used
      // Wichtig: Direkt camelCase in SQL verwenden
      const voteCycleQuery = await query(
        `SELECT COALESCE(SUM(vote_cycle), 0) AS totalCycles,
                COALESCE(SUM(version), 0) AS totalVersions
         FROM poll_user_voted
         WHERE poll_result_id = ?`,
        [pollResultId]
      );

      const totalVoteCycles = Array.isArray(voteCycleQuery) && voteCycleQuery.length > 0
        ? parseInt(voteCycleQuery[0].totalCycles, 10) || 0
        : 0;

      const totalVersions = Array.isArray(voteCycleQuery) && voteCycleQuery.length > 0
        ? parseInt(voteCycleQuery[0].totalVersions, 10) || 0
        : 0;

      // Use the higher value between vote_cycle and version totals for safety
      const effectiveVoteCycles = Math.max(totalVoteCycles, totalVersions);
      // Count users who have voted
      const votedUsersQuery = await query(
        `SELECT COUNT(DISTINCT id) AS total FROM poll_user_voted WHERE poll_result_id = ?`,
        [pollResultId]
      );

      const votedUsers = Array.isArray(votedUsersQuery) && votedUsersQuery.length > 0
        ? parseInt(votedUsersQuery[0].total, 10) || 0
        : 0;

      // Count eligible users
      const eligibleUsersQuery = await query(
        `SELECT COUNT(event_user.id) AS total
         FROM poll 
         INNER JOIN event_user ON poll.event_id = event_user.event_id
         WHERE poll.id = ? 
         AND event_user.verified = 1 
         AND event_user.allow_to_vote = 1 
         AND event_user.online = 1`,
        [pollId]
      );

      const eligibleUsers = Array.isArray(eligibleUsersQuery) && eligibleUsersQuery.length > 0
        ? parseInt(eligibleUsersQuery[0].total, 10) || 0
        : 0;

      // NEW: Count users who have completed all their votes
      const usersWithMaxVotesQuery = await query(
        `SELECT COUNT(*) AS completedUsers FROM poll_user_voted puv
         JOIN event_user eu ON puv.event_user_id = eu.id
         WHERE puv.poll_result_id = ? AND eu.vote_amount > 0 AND puv.vote_cycle >= eu.vote_amount`,
        [pollResultId]
      );

      const usersCompletedVoting = Array.isArray(usersWithMaxVotesQuery) && usersWithMaxVotesQuery.length > 0
        ? parseInt(usersWithMaxVotesQuery[0].completedUsers, 10) || 0
        : 0;

      // Check if all eligible users have completed voting
      // Only if there are eligible users and all have used their maximum votes
      const allUsersVotedMax = eligibleUsers > 0 && usersCompletedVoting >= eligibleUsers;

      if (allUsersVotedMax) {
        await query("COMMIT");
        return null; // This will trigger poll closure in the caller
      }

      await query("COMMIT");
      return {
        pollResultId,
        maxVotes,
        maxVoteCycles,
        pollUserVoteCycles: effectiveVoteCycles,
        pollUserVotedCount: votedUsers,
        pollAnswersCount: totalAnswers,
        pollUserCount: eligibleUsers,
        usersCompletedVoting: usersCompletedVoting // Add this new field
      };
    } catch (innerError) {
      console.error(`[ERROR:LEFT_ANSWERS] Inner transaction error:`, innerError);
      await query("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    console.error(`[ERROR:LEFT_ANSWERS] Error in findLeftAnswersCount:`, error);
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Ignore rollback errors
    }
    return null;
  }
}

export async function closePollResult(id) {

  // First check if it's already closed
  const checkQuery = await query("SELECT closed FROM poll_result WHERE id = ?", [id]);
  const isAlreadyClosed = Array.isArray(checkQuery) &&
    checkQuery.length > 0 &&
    checkQuery[0].closed === 1;

  if (isAlreadyClosed) {
    return true;
  }

  const result = await query("UPDATE poll_result SET closed = ? WHERE id = ?", [1, id]);

  // Verify the update worked
  const verifyQuery = await query("SELECT closed FROM poll_result WHERE id = ?", [id]);
  if (Array.isArray(verifyQuery) && verifyQuery.length > 0) {
    const actualClosed = verifyQuery[0].closed === 1;
    return actualClosed;
  }

  return false;
}

export async function closeAllPollResultsByEventId(eventId) {
  await query(
    `
    UPDATE poll_result
    INNER JOIN poll 
      ON poll.id = poll_result.poll_id
    INNER JOIN event 
      ON event.id = poll.event_id
    SET poll_result.closed = 1
    WHERE event.id = ?
  `,
    [eventId],
  );
}

export async function findActivePoll(eventId) {
  const result = await query(
    `
  SELECT
    poll_result.id AS id,
    poll.title AS title,
    poll_result.max_votes AS max_votes,
    (SELECT COUNT(poll_user.event_user_id) FROM poll_user WHERE poll_user.poll_id = poll.id) AS pollUserCount,
    (SELECT COUNT(poll_user_voted.id) FROM poll_user_voted WHERE poll_user_voted.poll_result_id = poll_result.id) AS pollUserVotedCount,
    (SELECT COUNT(poll_answer.id) FROM poll_answer WHERE poll_answer.poll_result_id = poll_result.id) AS answerCount
  FROM poll
  INNER JOIN poll_result ON poll.id = poll_result.poll_id
  WHERE poll.event_id = ? AND poll_result.closed = 0
  GROUP BY poll.id
  `,
    [eventId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findActivePollByUserId(eventUserId) {
  const result = await query(
    `
  SELECT
    poll_result.id AS id
  FROM poll
  INNER JOIN poll_result ON poll.id = poll_result.poll_id
  INNER JOIN event_user ON poll.event_id = event_user.event_id
  WHERE event_user.id = ? AND poll_result.closed = 0
  GROUP BY poll.id
  `,
    [eventUserId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

/**
 * Findet alle Events, die aktuell aktive Abstimmungen haben
 * @returns {Promise<Array>} - Liste aller Event-IDs mit aktiven Abstimmungen
 */
export async function findEventsWithActivePoll() {
  return await query(`
    SELECT DISTINCT poll.event_id AS id
    FROM poll
    INNER JOIN poll_result ON poll.id = poll_result.poll_id
    WHERE poll_result.closed = 0
  `);
}

export async function getPollOverview(eventId) {
  return await query(
    `
  SELECT
    poll.id, 
    poll.title, 
    poll.max_votes AS 'abzugebende Stimmen',
    (SELECT COUNT(poll_user.id) FROM poll_user WHERE poll_user.poll_id = poll.id) AS Teilnehmer,
    (SELECT COUNT(poll_user_voted.id) FROM poll_user_voted WHERE poll_user_voted.poll_result_id = poll_result.id) AS Abgestimmt,
    poll_result.max_votes AS 'maximale Stimmanzahl (Faktor abzugebenden Stimmen beachten)',
    (SELECT COUNT(poll_answer.id) FROM poll_answer WHERE poll_answer.poll_result_id = poll_result.id) AS 'abgegebene Stimmen (Delegiert mit Mehrfachstimmen beachten)'
    FROM
    poll
    INNER JOIN poll_result ON poll_result.poll_id = poll.id
    WHERE poll.event_id = ?
  `,
    [eventId],
  );
}

export async function getPollResults(eventId) {
  return await query(
    `
    SELECT
    poll.id,
    poll.title AS Abstimmung,
    poll_answer.answer_content AS Antworten,
    COUNT(poll_answer.id) AS Anzahl
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    INNER JOIN poll_answer ON poll_answer.poll_result_id = poll_result.id
    WHERE poll.event_id = ?
    GROUP BY poll_result.id, poll_answer.answer_content
  `,
    [eventId],
  );
}

export async function getPollResultsDetails(eventId) {
  return await query(
    `
    SELECT
    poll.id,
    poll.title AS Abstimmung,
    poll_answer.answer_content AS Antwort,
    poll_user.public_name AS Person,
    poll_user.username AS Benutzername
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    INNER JOIN poll_answer ON poll_answer.poll_result_id = poll_result.id
    LEFT JOIN poll_user ON poll_user.id = poll_answer.poll_user_id
    WHERE poll.event_id = ?
  `,
    [eventId],
  );
}

export async function getEventUsersWithVoteCount(eventId) {
  return await query(
    `
  SELECT
  poll_user.public_name AS Person,
  poll_user.username AS Benutzername,
  count(poll_user.event_user_id ) as Anzahl
  FROM poll_user
  INNER JOIN poll
  ON poll_user.poll_id = poll.id
  WHERE poll.event_id = ?
  GROUP BY poll_user.event_user_id 
  `,
    [eventId],
  );
}

export async function findActivePollEventUser(eventId) {
  const result = await query(
    `
  SELECT 'new' AS state, poll.id AS poll, poll_result.id AS poll_result_id
  FROM poll
  INNER JOIN poll_result ON poll.id = poll_result.poll_id
  WHERE poll.event_id = ? AND poll_result.closed = 0
  GROUP BY poll.id
  `,
    [eventId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_result", input);
}

export async function update(input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp();
  await updateQuery("poll_result", input);
}

export async function remove(id) {
  return await removeQuery("poll_result", id);
}