import {
  insert,
  update as updateQuery,
  remove as removeQuery,
  query,
} from "./../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

export async function findByPollResultId(pollResultId) {
  const result = await query(
    "SELECT * FROM poll_answer WHERE poll_result_id = ?",
    [pollResultId],
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Creates a new poll answer record
 * @param {Object} input - The poll answer data to insert
 * @returns {Promise<number|null>} - The ID of the created record or null if failed
 */
export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_answer", input);
}

/**
 * Updates an existing poll answer record
 * @param {Object} input - The poll answer data to update (must include id)
 * @returns {Promise<boolean>} - True if the update was successful, false otherwise
 */
export async function update(input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp();
  return await updateQuery("poll_answer", input);
}

/**
 * Removes a poll answer record
 * @param {number} id - The ID of the poll answer to remove
 * @returns {Promise<boolean>} - True if the removal was successful, false otherwise
 */
export async function remove(id) {
  return await removeQuery("poll_answer", id);
}

/**
 * Inserts a poll answer while ensuring vote limits are not exceeded
 * Uses transactions for atomicity and consistency
 * WICHTIG: Diese Funktion unterstützt jetzt auch einen voteComplete-Parameter, 
 * der anzeigt, ob der vote_cycle nach erfolgreicher Einfügung erhöht werden soll
 * @param {Object} input Input data with pollId, pollResultId, eventUserId, type, etc.
 * @param {boolean} [voteComplete=false] Flag indicating if this is the final answer in a ballot and vote_cycle should be incremented
 * @returns {Promise<Object|null>} The insertion result or null if failed
 */
export async function insertPollSubmitAnswer(input, voteComplete = false) {
  // Generiere eine eindeutige ID für diese Anfrageausführung zur Nachverfolgung
  const executionId = Math.random().toString(36).substring(2, 10);


  try {
    await query("START TRANSACTION", [], { throwError: true });

    try {
      // FIRST: Check if the poll is already closed or has reached its limits
      const pollQuery = await query(
        `SELECT pr.id, pr.max_votes AS maxVotes, pr.max_vote_cycles AS maxVoteCycles, 
                pr.closed AS closed, 
                COUNT(pa.id) AS currentAnswersCount
         FROM poll_result pr
         LEFT JOIN poll_answer pa ON pa.poll_result_id = pr.id
         WHERE pr.id = ?
         GROUP BY pr.id
         FOR UPDATE`,
        [input.pollResultId]
      );

      if (!Array.isArray(pollQuery) || pollQuery.length === 0) {
        console.error(`[ERROR:INSERT_ANSWER] Poll result ${input.pollResultId} not found`);
        await query("ROLLBACK", [], { throwError: true });
        return null;
      }

      // WICHTIG: maxVoteCycles ist die maximal erlaubte Anzahl von Stimmzetteln (nicht Stimmen!)
      const pollMaxVoteCycles = parseInt(pollQuery[0].maxVoteCycles, 10) || 0;

      // currentAnswersCount ist die aktuelle Anzahl einzelner Stimmen (nicht Stimmzettel!)
      // Diese beiden Werte dürfen NICHT direkt verglichen werden!
      const pollCurrentAnswers = parseInt(pollQuery[0].currentAnswersCount, 10) || 0;
      const isClosed = pollQuery[0].closed === 1;

      // If poll is closed, block the insertion
      if (isClosed) {
        console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING vote: Poll ${input.pollResultId} is already closed`);
        await query("COMMIT", [], { throwError: true });
        return null;
      }

      // Hier beziehen wir zu Informationszwecken die aktuellen Vote-Cycles
      const voteCyclesQuery = await query(
        `SELECT COALESCE(SUM(vote_cycle), 0) AS totalCycles FROM poll_user_voted WHERE poll_result_id = ?`,
        [input.pollResultId]
      );

      const totalVoteCycles = Array.isArray(voteCyclesQuery) && voteCyclesQuery.length > 0
        ? parseInt(voteCyclesQuery[0].totalCycles, 10) || 0
        : 0;

      // SECOND: For PUBLIC polls: Check if this would exceed the user's vote limit
      if (input.type === "PUBLIC") {

        // Get the event user's vote amount
        const userQuery = await query(
          `SELECT vote_amount AS voteAmount FROM event_user WHERE id = ? FOR UPDATE`,
          [input.eventUserId]
        );

        const maxVotes = Array.isArray(userQuery) && userQuery.length > 0
          ? parseInt(userQuery[0].voteAmount, 10) || 0
          : 0;


        // Count how many answers this user already has
        const currentCountQuery = await query(
          `SELECT COUNT(*) AS answerCount FROM poll_answer pa
           JOIN poll_user pu ON pa.poll_user_id = pu.id
           WHERE pa.poll_result_id = ? AND pu.event_user_id = ?
           FOR UPDATE`,
          [input.pollResultId, input.eventUserId]
        );

        const currentCount = Array.isArray(currentCountQuery) && currentCountQuery.length > 0
          ? parseInt(currentCountQuery[0].answerCount, 10) || 0
          : 0;


        // Block insertion if it would exceed the limit
        if (currentCount > maxVotes) {
          console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING PUBLIC vote: User ${input.eventUserId} exceeded limit (${currentCount}/${maxVotes})`);
          await query("COMMIT", [], { throwError: true }); // Still commit to release locks
          return null;
        }
      } else {
        // For SECRET polls: Check vote_cycle/version in poll_user_voted

        // Get the event user's vote amount
        const userQuery = await query(
          `SELECT vote_amount AS voteAmount FROM event_user WHERE id = ? FOR UPDATE`,
          [input.eventUserId]
        );

        const maxVotes = Array.isArray(userQuery) && userQuery.length > 0
          ? parseInt(userQuery[0].voteAmount, 10) || 0
          : 0;


        // Check vote_cycle for SECRET polls
        const voteCycleQuery = await query(
          `SELECT vote_cycle as voteCycle, version FROM poll_user_voted
           WHERE poll_result_id = ? AND event_user_id = ?
           FOR UPDATE`,
          [input.pollResultId, input.eventUserId]
        );

        if (Array.isArray(voteCycleQuery) && voteCycleQuery.length > 0) {
          const voteCycle = parseInt(voteCycleQuery[0].voteCycle, 10) || 0;
          const version = parseInt(voteCycleQuery[0].version, 10) || 0;
          const currentCount = Math.max(voteCycle, version);


          // Block insertion if it would exceed the limit
          if (currentCount > maxVotes) {
            console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING SECRET vote: User ${input.eventUserId} exceeded limit (${currentCount}/${maxVotes})`);
            await query("COMMIT", [], { throwError: true });
            return null;
          }
        }
      }

      // THIRD: Now perform the actual insertion based on poll type
      if (input.type === "PUBLIC") {
        // Get poll user ID with lock
        const pollUserQuery = await query(
          `SELECT poll_user.id FROM poll_user
           INNER JOIN poll_result ON poll_user.poll_id = poll_result.poll_id
           WHERE poll_user.event_user_id = ? AND poll_result.id = ?
           FOR UPDATE`,
          [input.eventUserId, input.pollResultId]
        );

        const pollUserId = Array.isArray(pollUserQuery) && pollUserQuery.length > 0
          ? pollUserQuery[0].id
          : null;

        if (!pollUserId) {
          console.error(`[ERROR:INSERT_ANSWER][${executionId}] Could not find poll_user for eventUserId=${input.eventUserId}, pollResultId=${input.pollResultId}`);
          await query("ROLLBACK", [], { throwError: true });
          return null;
        }

        // WICHTIG: Wir entfernen die letzte Prüfung auf die maximale Anzahl von Stimmen.
        // Nur die Vote-Cycles sind entscheidend für die Schließung einer Abstimmung, nicht die Anzahl der tatsächlich abgegebenen Stimmen.
        // Stellen wir sicher, dass diese Bedingung nicht mehr zum automatischen Schließen der Abstimmung führt.

        // Zur Information protokollieren wir aber weiterhin die aktuelle Anzahl
        const finalCountQuery = await query(
          `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ? FOR UPDATE`,
          [input.pollResultId]
        );

        const finalCount = Array.isArray(finalCountQuery) && finalCountQuery.length > 0
          ? parseInt(finalCountQuery[0].total, 10) || 0
          : 0;


        // Insert with poll_user_id for PUBLIC polls
        // Use insert() instead of raw query for better error handling and consistency
        await insert("poll_answer", {
          pollResultId: input.pollResultId,
          pollPossibleAnswerId: input.possibleAnswerId,
          answerContent: input.answerContent,
          pollUserId: pollUserId,
          createDatetime: getCurrentUnixTimeStamp()
        });
      } else {
        // WICHTIG: Wir entfernen die letzte Prüfung auf die maximale Anzahl von Stimmen.
        // Nur die Vote-Cycles sind entscheidend für die Schließung einer Abstimmung, nicht die Anzahl der tatsächlich abgegebenen Stimmen.
        // Stellen wir sicher, dass diese Bedingung nicht mehr zum automatischen Schließen der Abstimmung führt.

        // Zur Information protokollieren wir aber weiterhin die aktuelle Anzahl
        const finalCountQuery = await query(
          `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ? FOR UPDATE`,
          [input.pollResultId]
        );

        const finalCount = Array.isArray(finalCountQuery) && finalCountQuery.length > 0
          ? parseInt(finalCountQuery[0].total, 10) || 0
          : 0;

        // Use insert() instead of raw query for SECRET polls
        await insert("poll_answer", {
          pollResultId: input.pollResultId,
          pollPossibleAnswerId: input.possibleAnswerId,
          answerContent: input.answerContent,
          createDatetime: getCurrentUnixTimeStamp()
        });
      }

      // FOURTH: Log the number of votes after insertion, but DON'T auto-close based on this
      const postInsertCountQuery = await query(
        `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ?`,
        [input.pollResultId]
      );

      const postInsertCount = Array.isArray(postInsertCountQuery) && postInsertCountQuery.length > 0
        ? parseInt(postInsertCountQuery[0].total, 10) || 0
        : 0;

      // Das stimmt besser überein: Schauen wir uns den tatsächlichen vote_cycle-Stand an
      const voteCycleStatusQuery = await query(
        `SELECT COALESCE(SUM(vote_cycle), 0) AS totalCycles, 
                COALESCE(MAX(vote_cycle), 0) AS maxUserCycle
         FROM poll_user_voted 
         WHERE poll_result_id = ?`,
        [input.pollResultId]
      );

      const updatedTotalVoteCycles = Array.isArray(voteCycleStatusQuery) && voteCycleStatusQuery.length > 0
        ? parseInt(voteCycleStatusQuery[0].totalCycles, 10) || 0
        : 0;

      const maxUserCycle = Array.isArray(voteCycleStatusQuery) && voteCycleStatusQuery.length > 0
        ? parseInt(voteCycleStatusQuery[0].maxUserCycle, 10) || 0
        : 0;


      // WICHTIG: Der vote_cycle repräsentiert VOLLSTÄNDIGE Stimmzettel, nicht einzelne Antworten
      // Wenn voteComplete=true, bedeutet das, dass ein kompletter Stimmzettel abgeben wurde
      // Das Erhöhen des vote_cycle wird aber erst VOR der NÄCHSTEN Abstimmungsrunde durchgeführt
      // Dies geschieht in der allowToCreateNewVote-Funktion im poll-user-voted-repository.js
      // Dort wird geprüft, ob der Benutzer die maximale Anzahl an Stimmzetteln erreicht hat

      // Wir erhöhen hier NICHT mehr den vote_cycle innerhalb derselben Transaktion, da dies dazu führen würde,
      // dass der Benutzer sofort zum nächsten Stimmzettel übergeht, bevor er eine weitere Antwort abgeben kann

      await query("COMMIT", [], { throwError: true });

      return true;
    } catch (txError) {
      // Rollback on any error
      console.error(`[ERROR:INSERT_ANSWER][${executionId}] Transaction error:`, txError);
      await query("ROLLBACK", [], { throwError: true });
      throw txError;
    }
  } catch (error) {
    console.error(`[ERROR:INSERT_ANSWER][${executionId}] Error in insertPollSubmitAnswer:`, error);

    // Attempt to rollback in case transaction is still open
    try {
      await query("ROLLBACK", [], { throwError: false });
    } catch (e) {
      console.error(`[ERROR:INSERT_ANSWER][${executionId}] Error during emergency rollback:`, e);
      // Continue despite error - we're already in an error handler
    }

    return null;
  }
}
