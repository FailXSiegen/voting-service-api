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
  console.log(`[DEBUG] findOneByPollId: Suche poll_result für poll_id=${pollId}`);
  try {
    // Nehmen wir den aktiven (neuesten) poll_result für diesen Poll
    const result = await query(
      `SELECT * FROM poll_result 
       WHERE poll_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [pollId]
    );
    console.log(`[DEBUG] findOneByPollId: Ergebnis für poll_id=${pollId}:`, result);
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
  console.log(`[DEBUG:LEFT_ANSWERS] findLeftAnswersCount: Checking poll ${pollResultId} for remaining votes`);

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
        console.log(`[DEBUG:LEFT_ANSWERS] Poll result ${pollResultId} not found`);
        await query("COMMIT");
        return null;
      }

      const maxVotes = parseInt(pollInfo[0].maxVotes, 10) || 0;
      const maxVoteCycles = parseInt(pollInfo[0].maxVoteCycles, 10) || 0;
      const pollId = pollInfo[0].pollId;
      const isClosed = pollInfo[0].closed === 1;

      console.log(`[DEBUG:LEFT_ANSWERS] Poll info: maxVotes=${maxVotes}, maxVoteCycles=${maxVoteCycles}, isClosed=${isClosed}`);

      // If poll is already marked as closed, return null
      if (isClosed) {
        console.log(`[DEBUG:LEFT_ANSWERS] Poll ${pollResultId} is already closed`);
        await query("COMMIT");
        return null;
      }

      // Get poll type to determine counting method
      const pollTypeQuery = await query(
        `SELECT type FROM poll WHERE id = ?`,
        [pollId]
      );

      const isPubilc = Array.isArray(pollTypeQuery) && pollTypeQuery.length > 0 && pollTypeQuery[0].type === "PUBLIC";
      console.log(`[DEBUG:LEFT_ANSWERS] Poll type: ${isPubilc ? "PUBLIC" : "SECRET"}`);

      // Count total answers (votes cast)
      const answerCountQuery = await query(
        `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ?`,
        [pollResultId]
      );

      const totalAnswers = Array.isArray(answerCountQuery) && answerCountQuery.length > 0
        ? parseInt(answerCountQuery[0].total, 10) || 0
        : 0;

      console.log(`[DEBUG:LEFT_ANSWERS] Total poll_answer count: ${totalAnswers}/${maxVotes}`);

      // If we've already reached the max votes, close the poll
      if (totalAnswers >= maxVotes) {
        console.log(`[DEBUG:LEFT_ANSWERS] Reached or exceeded max votes (${totalAnswers}/${maxVotes}), closing poll`);
        await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [pollResultId]);
        await query("COMMIT");
        return null;
      }

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
      console.log(`[DEBUG:LEFT_ANSWERS] Total voteCycles=${totalVoteCycles}, versions=${totalVersions}, using max=${effectiveVoteCycles}/${maxVoteCycles}`);

      // If we've reached the max vote cycles, close the poll
      if (effectiveVoteCycles >= maxVoteCycles) {
        console.log(`[DEBUG:LEFT_ANSWERS] Reached or exceeded max vote cycles (${effectiveVoteCycles}/${maxVoteCycles}), closing poll`);
        await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [pollResultId]);
        await query("COMMIT");
        return null;
      }

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

      console.log(`[DEBUG:LEFT_ANSWERS] Users: ${votedUsers} voted out of ${eligibleUsers} eligible`);

      // Construct the result - WICHTIG: GraphQL erwartet camelCase-Namen
      const result = {
        pollResultId: pollResultId,
        maxVotes: maxVotes, // camelCase statt snake_case
        maxVoteCycles: maxVoteCycles, // camelCase statt snake_case
        pollUserVoteCycles: effectiveVoteCycles, // camelCase statt snake_case
        pollUserVotedCount: votedUsers, // camelCase statt snake_case
        pollAnswersCount: totalAnswers, // camelCase statt snake_case
        pollUserCount: eligibleUsers // camelCase statt snake_case
      };

      // Final check: If answers_count or vote_cycles are at or above max, close poll and return null (no votes left)
      if (totalAnswers >= maxVotes || effectiveVoteCycles >= maxVoteCycles) {
        console.log(`[DEBUG:LEFT_ANSWERS] No votes left, closing poll`);
        await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [pollResultId]);
        await query("COMMIT");
        return null;
      }

      // Commit the transaction
      await query("COMMIT");
      console.log(`[DEBUG:LEFT_ANSWERS] Votes still available:`, result);
      return result;
    } catch (txError) {
      await query("ROLLBACK");
      console.error(`[ERROR:LEFT_ANSWERS] Transaction error:`, txError);
      throw txError;
    }
  } catch (error) {
    console.error(`[ERROR:LEFT_ANSWERS] Error in findLeftAnswersCount:`, error);

    // Try to rollback if transaction is still open
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Ignore
    }

    // Return null on error - treat as no votes left to be safe
    return null;
  }
}

export async function closePollResult(id) {
  console.log(`[DEBUG:CLOSE_POLL] Closing poll result with id: ${id}`);

  // First check if it's already closed
  const checkQuery = await query("SELECT closed FROM poll_result WHERE id = ?", [id]);
  const isAlreadyClosed = Array.isArray(checkQuery) &&
    checkQuery.length > 0 &&
    checkQuery[0].closed === 1;

  if (isAlreadyClosed) {
    console.log(`[DEBUG:CLOSE_POLL] Poll ${id} is already closed, skipping update`);
    return true;
  }

  const result = await query("UPDATE poll_result SET closed = ? WHERE id = ?", [1, id]);
  console.log(`[DEBUG:CLOSE_POLL] Poll close result:`, result);

  // Verify the update worked
  const verifyQuery = await query("SELECT closed FROM poll_result WHERE id = ?", [id]);
  if (Array.isArray(verifyQuery) && verifyQuery.length > 0) {
    const actualClosed = verifyQuery[0].closed === 1;
    console.log(`[DEBUG:CLOSE_POLL] Poll ${id} closed status after update: ${actualClosed}`);
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
