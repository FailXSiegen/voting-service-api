import {
  insert,
  update as updateQuery,
  remove as removeQuery,
  query,
} from "./../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";
import { 
  getPollResultCache,
  setPollResultCache,
  invalidatePollResultCache,
  invalidateEventPollResultsCache
} from "../../lib/poll-result-cache";

export async function findOneById(id) {
  // Try to get from cache first
  const cachedResult = getPollResultCache(id);
  if (cachedResult) {
    return cachedResult;
  }
  
  // Not in cache, get from database
  const result = await query("SELECT * FROM poll_result WHERE id = ?", [id]);
  const pollResult = Array.isArray(result) ? result[0] || null : null;
  
  // If it's closed, cache it for future requests
  if (pollResult && pollResult.closed === 1) {
    setPollResultCache(id, pollResult);
  }
  
  return pollResult;
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
  
  // Get results from database
  const results = await query(
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
  
  // Cache each closed poll result
  if (Array.isArray(results) && results.length > 0) {
    for (const pollResult of results) {
      // Add eventId to the poll data for easier cache invalidation by event
      pollResult.poll = pollResult.poll || {}; 
      pollResult.poll.eventId = eventId;
      
      // Cache the poll result
      setPollResultCache(pollResult.id, pollResult);
    }
  }
  
  return results;
}

/**
 * Überprüft, ob in der aktuellen Abstimmung noch Stimmen abgegeben werden können
 * Berücksichtigt sowohl die Gesamtzahl der möglichen Stimmen als auch die tatsächlich abgegebenen Stimmen
 * @param {number} pollResultId - ID des Abstimmungsergebnisses
 * @returns {Promise<Object|null>} - Informationen zu verbleibenden Stimmen oder null wenn keine mehr übrig
 */
/**
 * Optimized version for async events that skips auto-closure logic
 * This prevents async polls from being closed when all current users have voted
 */
export async function findLeftAnswersCountForAsync(pollResultId) {
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

      const effectiveVoteCycles = Math.max(totalVoteCycles, totalVersions);
      
      // Count users who have voted
      const votedUsersQuery = await query(
        `SELECT COUNT(DISTINCT id) AS total FROM poll_user_voted WHERE poll_result_id = ?`,
        [pollResultId]
      );

      const votedUsers = Array.isArray(votedUsersQuery) && votedUsersQuery.length > 0
        ? parseInt(votedUsersQuery[0].total, 10) || 0
        : 0;

      // Count eligible users from poll_user table
      const eligibleUsersQuery = await query(
        `SELECT COUNT(DISTINCT poll_user.event_user_id) AS total
         FROM poll_user
         WHERE poll_user.poll_id = ?`,
        [pollId]
      );

      const eligibleUsers = Array.isArray(eligibleUsersQuery) && eligibleUsersQuery.length > 0
        ? parseInt(eligibleUsersQuery[0].total, 10) || 0
        : 0;

      // Count users who have completed all their votes
      const usersWithMaxVotesQuery = await query(
        `SELECT COUNT(*) AS completedUsers FROM poll_user_voted puv
         JOIN event_user eu ON puv.event_user_id = eu.id
         WHERE puv.poll_result_id = ? AND eu.vote_amount > 0 AND puv.vote_cycle >= eu.vote_amount`,
        [pollResultId]
      );

      const usersCompletedVoting = Array.isArray(usersWithMaxVotesQuery) && usersWithMaxVotesQuery.length > 0
        ? parseInt(usersWithMaxVotesQuery[0].completedUsers, 10) || 0
        : 0;

      // WICHTIG: Für async Events - KEINE Auto-Close-Logik!
      // Neue User können später noch dazukommen

      await query("COMMIT");
      return {
        pollResultId,
        maxVotes,
        maxVoteCycles,
        pollUserVoteCycles: effectiveVoteCycles,
        pollUserVotedCount: votedUsers,
        pollAnswersCount: totalAnswers,
        pollUserCount: eligibleUsers,
        usersCompletedVoting: usersCompletedVoting
      };
    } catch (innerError) {
      console.error(`[ERROR:LEFT_ANSWERS_ASYNC] Inner transaction error:`, innerError);
      await query("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    console.error(`[ERROR:LEFT_ANSWERS_ASYNC] Error in findLeftAnswersCountForAsync:`, error);
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Ignore rollback errors
    }
    return null;
  }
}

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

      // Count eligible users from poll_user table instead of filtering by online status
      // This ensures consistency with what's shown in the poll details view
      const eligibleUsersQuery = await query(
        `SELECT COUNT(DISTINCT poll_user.event_user_id) AS total
         FROM poll_user
         WHERE poll_user.poll_id = ?`,
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
  // Nutze eine Transaktion für atomare Operationen
  try {
    await query("START TRANSACTION");
    
    try {
      // Kombinierte Abfrage: Prüfen und Aktualisieren in einem Schritt
      const updateResult = await query(
        `UPDATE poll_result SET closed = 1 
         WHERE id = ? AND closed = 0`,
        [id]
      );
      
      // Wenn nichts aktualisiert wurde, war es bereits geschlossen oder existiert nicht
      if (!updateResult || updateResult.affectedRows === 0) {
        await query("COMMIT");
        console.log(`[INFO:POLL] Poll ${id} was already closed or doesn't exist`);
        return true; // Bereits geschlossen
      }
      
      // In einer Abfrage alle benötigten Daten holen und Event-ID
      const pollResultData = await query(
        `SELECT pr.*, p.event_id AS eventId 
         FROM poll_result pr
         JOIN poll p ON pr.poll_id = p.id
         WHERE pr.id = ?`,
        [id]
      );
      
      // Cache-Update
      if (Array.isArray(pollResultData) && pollResultData.length > 0) {
        const pollResult = pollResultData[0];
        const eventId = pollResult.eventId;
        
        // Strukturiere die Daten für den Cache
        pollResult.poll = pollResult.poll || {};
        pollResult.poll.eventId = eventId;
        
        // Cache für zukünftige Abfragen
        setPollResultCache(id, pollResult);
        console.log(`[INFO:POLL] Poll ${id} has been closed and cached`);
        
        await query("COMMIT");
        return true;
      }
      
      await query("COMMIT");
      return false;
    } catch (innerError) {
      console.error(`[ERROR:CLOSE_POLL] Inner transaction error:`, innerError);
      await query("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    console.error(`[ERROR:CLOSE_POLL] Error in closePollResult:`, error);
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Rollback-Fehler ignorieren
    }
    return false;
  }
}

export async function closeAllPollResultsByEventId(eventId) {
  try {
    await query("START TRANSACTION");
    
    try {
      // Finde alle offenen Poll-IDs in einer optimierten Abfrage
      const pollResults = await query(
        `SELECT pr.id, pr.poll_id 
         FROM poll_result pr
         JOIN poll p ON pr.poll_id = p.id
         WHERE p.event_id = ? AND pr.closed = 0`,
        [eventId]
      );
      
      if (!Array.isArray(pollResults) || pollResults.length === 0) {
        await query("COMMIT");
        console.log(`[INFO:POLL] No open polls found for event ${eventId}`);
        return { success: true, closedCount: 0 };
      }
      
      // Extrahiere IDs für die Batch-Aktualisierung
      const pollResultIds = pollResults.map(pr => pr.id);
      
      // Batch-Update aller Poll-Results auf einmal
      await query(
        `UPDATE poll_result 
         SET closed = 1 
         WHERE id IN (?)`,
        [pollResultIds]
      );
      
      // Hole aktualisierte Daten für Cache in einer einzigen Abfrage
      const updatedPollResults = await query(
        `SELECT pr.*, p.event_id AS eventId 
         FROM poll_result pr
         JOIN poll p ON pr.poll_id = p.id
         WHERE pr.id IN (?)`,
        [pollResultIds]
      );
      
      // Cache-Updates in einer Schleife
      console.log(`[INFO:POLL] Closing and caching ${pollResultIds.length} polls for event ${eventId}`);
      
      if (Array.isArray(updatedPollResults)) {
        for (const pollResult of updatedPollResults) {
          // Strukturiere für den Cache
          pollResult.poll = pollResult.poll || {};
          pollResult.poll.eventId = eventId;
          
          // Cache setzen
          setPollResultCache(pollResult.id, pollResult);
        }
      }
      
      await query("COMMIT");
      return { success: true, closedCount: pollResultIds.length, pollResultIds };
    } catch (innerError) {
      console.error(`[ERROR:CLOSE_ALL_POLLS] Inner transaction error:`, innerError);
      await query("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    console.error(`[ERROR:CLOSE_ALL_POLLS] Error in closeAllPollResultsByEventId:`, error);
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Rollback-Fehler ignorieren
    }
    return { success: false, error: error.message };
  }
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
  // Cache key for this event's poll overview
  const cacheKey = `event_${eventId}_poll_overview`;
  
  // Check if we have a cached version
  const cachedResult = getPollResultCache(cacheKey);
  if (cachedResult) {
    console.log(`[INFO:CACHE] Returned cached poll overview for event ${eventId}`);
    return cachedResult;
  }
  
  // Fetch from database
  const results = await query(
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
  
  // Check if all poll results for this event are closed
  const hasOpenPolls = await query(
    `
    SELECT COUNT(*) AS openPollCount
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    WHERE poll.event_id = ? AND poll_result.closed = 0
    `,
    [eventId]
  );
  
  const openPollCount = Array.isArray(hasOpenPolls) && hasOpenPolls.length > 0
    ? parseInt(hasOpenPolls[0].openPollCount, 10) || 0
    : 0;
  
  // Only cache if all polls for this event are closed
  if (openPollCount === 0 && Array.isArray(results) && results.length > 0) {
    setPollResultCache(cacheKey, results);
    console.log(`[INFO:CACHE] Cached poll overview for event ${eventId}`);
  }
  
  return results;
}

export async function getPollResults(eventId) {
  // Cache key for this event's poll results summary
  const cacheKey = `event_${eventId}_poll_results`;
  
  // Check if we have a cached version
  const cachedResult = getPollResultCache(cacheKey);
  if (cachedResult) {
    console.log(`[INFO:CACHE] Returned cached poll results for event ${eventId}`);
    return cachedResult;
  }
  
  // Fetch from database
  const results = await query(
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
  
  // Check if all poll results for this event are closed
  const hasOpenPolls = await query(
    `
    SELECT COUNT(*) AS openPollCount
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    WHERE poll.event_id = ? AND poll_result.closed = 0
    `,
    [eventId]
  );
  
  const openPollCount = Array.isArray(hasOpenPolls) && hasOpenPolls.length > 0
    ? parseInt(hasOpenPolls[0].openPollCount, 10) || 0
    : 0;
  
  // Only cache if all polls for this event are closed
  if (openPollCount === 0 && Array.isArray(results) && results.length > 0) {
    setPollResultCache(cacheKey, results);
    console.log(`[INFO:CACHE] Cached poll results for event ${eventId}`);
  }
  
  return results;
}

export async function getPollResultsDetails(eventId) {
  // Cache key for this event's detailed poll results
  const cacheKey = `event_${eventId}_poll_results_details`;
  
  // Check if we have a cached version
  const cachedResult = getPollResultCache(cacheKey);
  if (cachedResult) {
    console.log(`[INFO:CACHE] Returned cached detailed poll results for event ${eventId}`);
    return cachedResult;
  }
  
  // Fetch from database
  const results = await query(
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
  
  // Check if all poll results for this event are closed
  const hasOpenPolls = await query(
    `
    SELECT COUNT(*) AS openPollCount
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    WHERE poll.event_id = ? AND poll_result.closed = 0
    `,
    [eventId]
  );
  
  const openPollCount = Array.isArray(hasOpenPolls) && hasOpenPolls.length > 0
    ? parseInt(hasOpenPolls[0].openPollCount, 10) || 0
    : 0;
  
  // Only cache if all polls for this event are closed
  if (openPollCount === 0 && Array.isArray(results) && results.length > 0) {
    setPollResultCache(cacheKey, results);
    console.log(`[INFO:CACHE] Cached detailed poll results for event ${eventId}`);
  }
  
  return results;
}

export async function getEventUsersWithVoteCount(eventId) {
  // Cache key for this event's user vote count
  const cacheKey = `event_${eventId}_user_vote_count`;
  
  // Check if we have a cached version
  const cachedResult = getPollResultCache(cacheKey);
  if (cachedResult) {
    console.log(`[INFO:CACHE] Returned cached user vote counts for event ${eventId}`);
    return cachedResult;
  }
  
  // Fetch from database
  const results = await query(
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
  
  // Check if all poll results for this event are closed
  const hasOpenPolls = await query(
    `
    SELECT COUNT(*) AS openPollCount
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    WHERE poll.event_id = ? AND poll_result.closed = 0
    `,
    [eventId]
  );
  
  const openPollCount = Array.isArray(hasOpenPolls) && hasOpenPolls.length > 0
    ? parseInt(hasOpenPolls[0].openPollCount, 10) || 0
    : 0;
  
  // Only cache if all polls for this event are closed
  if (openPollCount === 0 && Array.isArray(results) && results.length > 0) {
    setPollResultCache(cacheKey, results);
    console.log(`[INFO:CACHE] Cached user vote counts for event ${eventId}`);
  }
  
  return results;
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
  
  // Invalidate cache for this poll result
  if (input.id) {
    invalidatePollResultCache(input.id);
  }
  
  const success = await updateQuery("poll_result", input);
  
  // If this updated the poll to be closed, re-cache it
  if (success && input.closed === 1) {
    const updatedResult = await findOneById(input.id);
    if (updatedResult) {
      setPollResultCache(input.id, updatedResult);
    }
  }
  
  return success;
}

export async function remove(id) {
  // Invalidate cache for this poll result
  invalidatePollResultCache(id);

  return await removeQuery("poll_result", id);
}

/**
 * Findet alle aktiven PUBLIC polls mit publicVoteVisible = true
 * Für den globalen Cache-Service
 */
export async function findActivePublicPollsWithVisibility() {
  const sql = `
    SELECT
      pr.id as pollResultId,
      p.event_id as eventId,
      pr.poll_id as pollId,
      p.title as pollTitle,
      e.title as eventName
    FROM poll_result pr
    JOIN poll p ON pr.poll_id = p.id
    JOIN event e ON p.event_id = e.id
    WHERE pr.closed = 0
      AND p.type = 1
      AND e.public_vote_visible = 1
  `;

  try {
    const result = await query(sql);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('[findActivePublicPollsWithVisibility] Fehler:', error);
    return [];
  }
}