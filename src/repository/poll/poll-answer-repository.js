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

  // OPTIMIERUNG: Lastverteilung durch Jitter bei individuellen Votes
  // Für Bulk-Operationen wird der Jitter in der Bulk-Methode hinzugefügt
  // Hier fügen wir nur für individuelle Votes Jitter hinzu
  if (input.eventUserId) {
    // Kleinere Verzögerung als bei Bulk (0-150ms)
    const jitterMs = (input.eventUserId % 5) * 30;
    if (jitterMs > 0) {
      console.log(`[INFO:INSERT_ANSWER][${executionId}] Adding jitter delay of ${jitterMs}ms for user ${input.eventUserId}`);
      await new Promise(resolve => setTimeout(resolve, jitterMs));
    }
  }

  try {
    await query("START TRANSACTION", [], { throwError: true });

    try {
      // OPTIMIERT: Check if the poll is already closed but ohne FOR UPDATE Lock, um Concurrency zu erhöhen
      // Wir reduzieren die Lock-Zeit indem wir erst nur prüfen, ob der Poll geschlossen ist
      const pollStatusQuery = await query(
        `SELECT pr.id, pr.max_votes AS maxVotes, pr.max_vote_cycles AS maxVoteCycles, 
                pr.closed AS closed
         FROM poll_result pr
         WHERE pr.id = ?`,
        [input.pollResultId]
      );
      
      // Falls der Poll geschlossen ist, können wir sofort abbrechen ohne weitere Locks
      if (Array.isArray(pollStatusQuery) && pollStatusQuery.length > 0 && pollStatusQuery[0].closed === 1) {
        console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING vote: Poll ${input.pollResultId} is already closed (fast path)`);
        await query("COMMIT", [], { throwError: true });
        return null;
      }
      
      // Nur wenn der Poll offen ist, holen wir die Antworten mit Lock
      const pollQuery = await query(
        `SELECT pr.id, pr.max_votes AS maxVotes, pr.max_vote_cycles AS maxVoteCycles, 
                pr.closed AS closed, 
                (SELECT COUNT(*) FROM poll_answer WHERE poll_result_id = pr.id) AS currentAnswersCount
         FROM poll_result pr
         WHERE pr.id = ?
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


      // OPTIMIERT: Überprüfe zuerst die Stimmberechtigung ohne Sperren
      // Dies reduziert Locks bei gleichzeitigen Abstimmungen erheblich
      const userQueryNoLock = await query(
        `SELECT vote_amount AS voteAmount FROM event_user WHERE id = ?`,
        [input.eventUserId]
      );

      const maxVotes = Array.isArray(userQueryNoLock) && userQueryNoLock.length > 0
        ? parseInt(userQueryNoLock[0].voteAmount, 10) || 0
        : 0;
      
      // Wenn der Benutzer keine Stimmberechtigung hat, können wir sofort abbrechen
      if (maxVotes <= 0) {
        console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING vote: User ${input.eventUserId} has no vote rights (voteAmount: ${maxVotes})`);
        await query("COMMIT", [], { throwError: true });
        return null;
      }
      
      // Nur wenn der Benutzer Stimmrechte hat, holen wir die Daten mit Lock
      // Dies ist notwendig für die Konsistenz beim Verändern von Daten
      const userQuery = await query(
        `SELECT vote_amount AS voteAmount FROM event_user WHERE id = ? FOR UPDATE`,
        [input.eventUserId]
      );
      
      // Nochmalige Überprüfung mit Lock (falls zwischen den Abfragen etwas geändert wurde)
      const maxVotesWithLock = Array.isArray(userQuery) && userQuery.length > 0
        ? parseInt(userQuery[0].voteAmount, 10) || 0
        : 0;
        
      if (maxVotesWithLock <= 0) {
        console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING vote: User ${input.eventUserId} lost vote rights between queries`);
        await query("COMMIT", [], { throwError: true });
        return null;
      }


      // OPTIMIERT: Check vote_cycle for SECRET polls ohne FOR UPDATE Lock
      // Erst ohne Lock prüfen, ob die Stimme zulässig wäre
      const voteCycleQueryNoLock = await query(
        `SELECT vote_cycle as voteCycle, version FROM poll_user_voted
          WHERE poll_result_id = ? AND event_user_id = ?`,
        [input.pollResultId, input.eventUserId]
      );

      // Vorprüfung ohne Lock, um schnell ungültige Stimmen abzuweisen
      if (Array.isArray(voteCycleQueryNoLock) && voteCycleQueryNoLock.length > 0) {
        const voteCycle = parseInt(voteCycleQueryNoLock[0].voteCycle, 10) || 0;
        const version = parseInt(voteCycleQueryNoLock[0].version, 10) || 0;
        const currentCount = Math.max(voteCycle, version);

        // Block insertion if it would exceed the limit (schneller Pfad ohne Lock)
        if (currentCount > maxVotesWithLock) {
          console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING SECRET vote (fast path): User ${input.eventUserId} exceeded limit (${currentCount}/${maxVotesWithLock})`);
          await query("COMMIT", [], { throwError: true });
          return null;
        }
      }
      
      // Nur wenn die Vorprüfung ok ist, mit Lock abfragen für die tatsächliche Transaktion
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

        // Nochmalige Prüfung mit Lock (falls sich etwas zwischen den Abfragen geändert hat)
        if (currentCount > maxVotesWithLock) {
          console.warn(`[WARN:INSERT_ANSWER][${executionId}] BLOCKING SECRET vote: User ${input.eventUserId} exceeded limit (${currentCount}/${maxVotesWithLock})`);
          await query("COMMIT", [], { throwError: true });
          return null;
        }
      }


      // THIRD: Now perform the actual insertion based on poll type
      if (input.type === "PUBLIC") {
        // OPTIMIERT: Get poll user ID ohne Lock für schnellere Parallelverarbeitung
        const pollUserQueryNoLock = await query(
          `SELECT poll_user.id FROM poll_user
           INNER JOIN poll_result ON poll_user.poll_id = poll_result.poll_id
           WHERE poll_user.event_user_id = ? AND poll_result.id = ?`,
          [input.eventUserId, input.pollResultId]
        );

        const pollUserId = Array.isArray(pollUserQueryNoLock) && pollUserQueryNoLock.length > 0
          ? pollUserQueryNoLock[0].id
          : null;

        if (!pollUserId) {
          console.error(`[ERROR:INSERT_ANSWER][${executionId}] Could not find poll_user for eventUserId=${input.eventUserId}, pollResultId=${input.pollResultId}`);
          await query("ROLLBACK", [], { throwError: true });
          return null;
        }
        
        // Prüfen wir noch einmal mit Lock, aber nur wenn wir einen gültigen poll_user gefunden haben
        // Dies ist notwendig, um sicherzustellen, dass der poll_user nicht in der Zwischenzeit gelöscht wurde
        const pollUserQuery = await query(
          `SELECT id FROM poll_user WHERE id = ? FOR UPDATE`,
          [pollUserId]
        );
        
        const pollUserIdWithLock = Array.isArray(pollUserQuery) && pollUserQuery.length > 0
          ? pollUserQuery[0].id
          : null;
          
        if (!pollUserIdWithLock) {
          console.error(`[ERROR:INSERT_ANSWER][${executionId}] poll_user ${pollUserId} was deleted between queries`);
          await query("ROLLBACK", [], { throwError: true });
          return null;
        }

        // WICHTIG: Wir entfernen die letzte Prüfung auf die maximale Anzahl von Stimmen.
        // Nur die Vote-Cycles sind entscheidend für die Schließung einer Abstimmung, nicht die Anzahl der tatsächlich abgegebenen Stimmen.
        // Stellen wir sicher, dass diese Bedingung nicht mehr zum automatischen Schließen der Abstimmung führt.

        // OPTIMIERT: Verzicht auf count mit FOR UPDATE Lock, um Parallelverarbeitung zu ermöglichen
        // Stattdessen zählen wir ohne Lock - nur für Logging-Zwecke, keine Entscheidung basiert darauf
        const finalCountQuery = await query(
          `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ?`,
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

        // OPTIMIERT: Verzicht auf count mit FOR UPDATE Lock, um Parallelverarbeitung zu ermöglichen
        // Stattdessen zählen wir ohne Lock - nur für Logging-Zwecke, keine Entscheidung basiert darauf
        const finalCountQuery = await query(
          `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ?`,
          [input.pollResultId]
        );

        const finalCount = Array.isArray(finalCountQuery) && finalCountQuery.length > 0
          ? parseInt(finalCountQuery[0].total, 10) || 0
          : 0;

        // Use insert() instead of raw query for SECRET polls
        // WICHTIG: Kein Timestamp bei geheimen Wahlen für Anonymität
        await insert("poll_answer", {
          pollResultId: input.pollResultId,
          pollPossibleAnswerId: input.possibleAnswerId,
          answerContent: input.answerContent,
          createDatetime: null
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
