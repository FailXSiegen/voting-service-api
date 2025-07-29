import { insertPollSubmitAnswer } from "../../../repository/poll/poll-answer-repository";
import {
  findLeftAnswersCount,
  findLeftAnswersCountForAsync,
  closePollResult,
  findOneByPollId,
} from "../../../repository/poll/poll-result-repository";
import {
  findEventIdByPollResultId,
  getMultivoteType,
} from "../../../repository/event-repository";
import { findOneById } from "../../../repository/event-user-repository";
import { pubsub } from "../../../server/graphql";
import {
  POLL_ANSWER_LIFE_CYCLE,
  POLL_LIFE_CYCLE,
} from "../subscription/subscription-types";
import {
  createPollUserIfNeeded,
  existsPollUserVoted,
} from "../../../service/poll-service";
// Wir haben die Inkrementierung des vote_cycle in die insertPollSubmitAnswer-Funktion integriert,
// daher importieren wir incrementVoteCycleAfterVote nicht mehr
import { incrementVoteCycleAfterVote } from "../../../repository/poll/poll-user-voted-repository";
import { query } from "../../../lib/database";
import { getCurrentUnixTimeStamp } from "../../../lib/time-stamp";
import poll from "./poll";

/**
 * Publishes a POLL_LIFE_CYCLE event with the "closed" state
 * Ensures all necessary poll data is included for proper client-side processing
 * 
 * @param {number} pollResultId - The ID of the poll result
 * @param {number} eventId - The ID of the event
 * @param {number|null} pollId - Optional poll ID (will be fetched if not provided)
 * @returns {Promise<void>}
 */
async function publishPollClosedEvent(pollResultId, eventId, pollId = null) {
  // First ensure the poll_result is actually closed in the database
  // Da wir kein vollständiges Objekt mit ID haben, nutzen wir den direkten query-Ansatz
  await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [pollResultId], { throwError: true });
  // Fetch poll_id if not provided
  if (!pollId) {
    const pollQuery = await query("SELECT poll_id AS pollId FROM poll_result WHERE id = ?", [pollResultId]);
    pollId = Array.isArray(pollQuery) && pollQuery.length > 0 ? pollQuery[0].pollId : null;
  }

  if (!pollId) {
    console.error(`[ERROR:POLL_LIFECYCLE] Could not find poll_id for poll_result ${pollResultId}`);
    return;
  }

  // Fetch complete poll data
  const completePollQuery = await query(
    `SELECT id, title, poll_answer AS pollAnswer, type, list, min_votes AS minVotes, 
            max_votes AS maxVotes, allow_abstain AS allowAbstain
     FROM poll WHERE id = ?`,
    [pollId]
  );

  // Fetch possible answers
  const possibleAnswersQuery = await query(
    "SELECT id, content FROM poll_possible_answer WHERE poll_id = ?",
    [pollId]
  );

  let completePoll = Array.isArray(completePollQuery) && completePollQuery.length > 0
    ? completePollQuery[0]
    : null;

  const possibleAnswers = Array.isArray(possibleAnswersQuery)
    ? possibleAnswersQuery
    : [];

  if (!completePoll) {
    console.error(`[ERROR:POLL_LIFECYCLE] Could not find complete poll data for poll ${pollId}`);

    // Create fallback object with default values for non-nullable fields
    completePoll = {
      id: pollId,
      title: "[Unknown Poll]",
      pollAnswer: "",
      type: "SECRET",
      list: false,
      minVotes: 0,
      maxVotes: 0,
      allowAbstain: false,
      possibleAnswers: []
    };

    console.warn(`[WARN:POLL_LIFECYCLE] Using fallback poll data due to missing information`);
  }

  // Add possible answers to the poll object
  completePoll.possibleAnswers = possibleAnswers;

  // Publish the event
  // CRITICAL: When publishing poll closed events, we must ensure they are delivered
  // Don't throttle, don't debounce, but still deduplicate just in case
  // Force immediate delivery with priority flag
  pubsub.publish(POLL_LIFE_CYCLE, {
    eventId: eventId,
    state: "closed",
    poll: completePoll,
    pollResultId: pollResultId
  }, {
    // No throttling for poll state changes - critical real-time updates
    throttleMs: 0,
    debounceMs: 0,
    cacheState: true,
    skipIfEqual: false, // Always send even if payload looks the same
    filterBy: { pollResultId, state: "closed" },
    priority: true  // Mark as high priority event
  });

}


/**
 * Helper function to check if an event is asynchronous
 */
async function isAsyncEvent(eventId) {
  const eventQuery = await query(
    "SELECT async FROM event WHERE id = ?",
    [eventId]
  );
  
  return Array.isArray(eventQuery) && 
    eventQuery.length > 0 && 
    eventQuery[0].async === 1;
}

async function publishPollLifeCycle(pollResultId) {
  const eventId = await findEventIdByPollResultId(pollResultId);
  if (!eventId) {
    console.warn(
      'Could not execute publishPollLifeCycle. Missing "eventId" or "pollResultId"',
      { pollResultId, eventId },
    );
    return;
  }

  // Check if this is an async event - don't auto-close async event polls
  if (await isAsyncEvent(eventId)) {
    console.info(`[INFO:POLL_LIFECYCLE] Skipping auto-close for async event ${eventId}, poll ${pollResultId}`);
    return;
  }

  // Close the poll and verify it was closed successfully (only for synchronous events)
  await closePollResult(pollResultId);
  await publishPollClosedEvent(pollResultId, eventId);
}

export default {
  // todo refactor + document the logic here.
  createPollSubmitAnswer: async (_, { input }) => {
    console.log(`[DEBUG:POLL_ANSWER] Starting createPollSubmitAnswer for user ${input.eventUserId}, poll ${input.pollId}`);

    const cloneAnswerObject = {};
    const pollId = input.pollId;
    const pollResult = await findOneByPollId(input.pollId);
    if (!pollResult) {
      console.error(`[DEBUG:POLL_ANSWER] Error: Missing poll result for pollId ${input.pollId}`);
      throw Error("Missing poll result record!");
    }
    console.log(`[DEBUG:POLL_ANSWER] Found pollResult:`, pollResult);

    const eventId = await findEventIdByPollResultId(pollResult.id);
    if (!eventId) {
      console.error(`[DEBUG:POLL_ANSWER] Error: Missing event for pollResultId ${pollResult.id}`);
      throw Error("Missing related event record!");
    }


    input.pollResultId = pollResult.id; // fixme This is a quick fix because the following code relies on the now missing input.pollResultId.
    Object.assign(cloneAnswerObject, input);
    delete input.answerItemCount;
    delete input.answerItemLength;

    let leftAnswersDataSet = null;
    let allowToVote = true;
    const multivoteType = await getMultivoteType(eventId);
    const multiVote = multivoteType === 2 || input.multivote;

    // Check existing vote state for user
    const userVotedQuery = await query(
      `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
       WHERE poll_result_id = ? AND event_user_id = ?`,
      [pollResult.id, input.eventUserId]
    );
    const currentVoteCycle = Array.isArray(userVotedQuery) && userVotedQuery.length > 0
      ? parseInt(userVotedQuery[0].voteCycle, 10) || 0
      : 0;

    // Get user's total allowed votes
    const eventUser = await findOneById(input.eventUserId);
    const totalAllowedVotes = eventUser ? parseInt(eventUser.voteAmount, 10) || 0 : 0;
    if (
      cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount
    ) {
      ;
      // Use async-optimized version for async events
      const isAsync = await isAsyncEvent(eventId);
      if (isAsync) {
        leftAnswersDataSet = await findLeftAnswersCountForAsync(pollResult.id);
        console.log(`[DEBUG:POLL_ANSWER] findLeftAnswersCountForAsync returned:`, leftAnswersDataSet);
      } else {
        leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);
        console.log(`[DEBUG:POLL_ANSWER] findLeftAnswersCount returned:`, leftAnswersDataSet);
      }
      if (leftAnswersDataSet === null) {
        console.log(`[DEBUG:POLL_ANSWER] leftAnswersDataSet is null - poll may be closed or at capacity`);

        // First check if the poll is already closed
        const pollStatusCheck = await query(
          "SELECT closed FROM poll_result WHERE id = ?",
          [pollResult.id]
        );

        const isAlreadyClosed = Array.isArray(pollStatusCheck) &&
          pollStatusCheck.length > 0 &&
          pollStatusCheck[0].closed === 1;

        // Auch wenn die Abstimmung bereits geschlossen ist, TROTZDEM das Event veröffentlichen,
        // damit der Client über den Status informiert wird!
        if (isAlreadyClosed) {
          if (eventId) {
            // Vollständige Poll-Daten abrufen, um GraphQL-Fehler zu vermeiden
            const completePollQuery = await query(
              `SELECT id, title, poll_answer AS pollAnswer, type, list, min_votes AS minVotes, 
                      max_votes AS maxVotes, allow_abstain AS allowAbstain
               FROM poll WHERE id = ?`,
              [pollId]
            );

            // Mögliche Antworten abrufen
            const possibleAnswersQuery = await query(
              "SELECT id, content FROM poll_possible_answer WHERE poll_id = ?",
              [pollId]
            );

            const completePoll = Array.isArray(completePollQuery) && completePollQuery.length > 0
              ? completePollQuery[0]
              : null;

            const possibleAnswers = Array.isArray(possibleAnswersQuery)
              ? possibleAnswersQuery
              : [];

            // Sicherstellen, dass wir ein vollständiges Poll-Objekt mit allen erforderlichen Feldern haben
            if (completePoll) {
              // Füge die möglichen Antworten hinzu
              completePoll.possibleAnswers = possibleAnswers;

              pubsub.publish(POLL_LIFE_CYCLE, {
                eventId: eventId,
                state: "closed",
                poll: completePoll,
                pollResultId: pollResult.id
              }, {
                // No throttling for poll state changes - critical real-time updates
                throttleMs: 0,
                debounceMs: 0,
                cacheState: true,
                skipIfEqual: false, // Always send even if payload looks the same
                filterBy: { pollResultId: pollResult.id, state: "closed" },
                priority: true  // Mark as high priority event
              });
            } else {
              console.error(`[ERROR:POLL_ANSWER] Could not find complete poll data for poll ${pollId}`);

              // Fallback für den Fall, dass keine vollständigen Daten gefunden wurden
              pubsub.publish(POLL_LIFE_CYCLE, {
                eventId: eventId,
                state: "closed",
                poll: {
                  id: pollId,
                  title: "[Unknown Poll]", // Standardwert für non-nullable Feld
                  pollAnswer: "",
                  type: "SECRET",
                  list: false,
                  minVotes: 0,
                  maxVotes: 0,
                  allowAbstain: false,
                  possibleAnswers: []
                },
                pollResultId: pollResult.id
              }, {
                // No throttling for poll state changes - critical real-time updates
                throttleMs: 0,
                debounceMs: 0,
                cacheState: true,
                skipIfEqual: false, // Always send even if payload looks the same
                filterBy: { pollResultId: pollResult.id, state: "closed" },
                priority: true  // Mark as high priority event
              });
            }
          }
        } else {
          await publishPollLifeCycle(pollResult.id);
        }

        return false;
      }

      console.log(`[DEBUG:POLL_ANSWER] Calling existsPollUserVoted for user ${input.eventUserId}, multiVote=${multiVote}`);
      allowToVote = await existsPollUserVoted(
        pollResult.id,
        input.eventUserId,
        multiVote,
        input // Übergebe den gesamten input, damit voteCycle verfügbar ist
      );
      console.log(`[DEBUG:POLL_ANSWER] existsPollUserVoted returned: ${allowToVote}`);

    }
    if (allowToVote) {
      console.log(`[DEBUG:POLL_ANSWER] Calling createPollUserIfNeeded with pollResultId=${pollResult.id}, eventUserId=${input.eventUserId}`);
      await createPollUserIfNeeded(pollResult.id, input.eventUserId);
      let actualAnswerCount = 0;
      await query("START TRANSACTION", [], { throwError: true });
      try {
        // For SECRET polls, we need to use poll_user_voted.vote_cycle as our source of truth
        const voteCycleQuery = await query(
          `SELECT vote_cycle AS voteCycle, version 
            FROM poll_user_voted
            WHERE poll_result_id = ? AND event_user_id = ?
            FOR UPDATE`,
          [pollResult.id, input.eventUserId]
        );

        if (Array.isArray(voteCycleQuery) && voteCycleQuery.length > 0) {
          // Use the higher value between vote_cycle and version to be safe
          const voteCycle = parseInt(voteCycleQuery[0].voteCycle, 10) || 0;
          const version = parseInt(voteCycleQuery[0].version, 10) || 0;
          actualAnswerCount = Math.max(voteCycle, version);

          // If vote_cycle and version are out of sync, try to fix them
          if (voteCycle !== version) {
            console.warn(`[WARN:POLL_ANSWER] Found discrepancy between vote_cycle (${voteCycle}) and version (${version}). Attempting to sync them to ${actualAnswerCount}`);

            // Update both to the higher value for consistency
            // Da wir einen komplexen WHERE haben und kein einzelnes ID-Feld,
            // verwenden wir weiterhin den direkten query-Ansatz
            await query(
              `UPDATE poll_user_voted 
                SET vote_cycle = ?, version = ?
                WHERE poll_result_id = ? AND event_user_id = ?`,
              [actualAnswerCount, actualAnswerCount, pollResult.id, input.eventUserId],
              { throwError: true }
            );

            // Verify the update
            const verifySync = await query(
              `SELECT vote_cycle AS voteCycle, version 
                FROM poll_user_voted
                WHERE poll_result_id = ? AND event_user_id = ?
                FOR UPDATE`,
              [pollResult.id, input.eventUserId]
            );
          }
        }

        // Commit the transaction after getting the accurate count
        await query("COMMIT", [], { throwError: true });
      } catch (error) {
        // Rollback in case of any errors
        await query("ROLLBACK", [], { throwError: true });
        console.error(`[ERROR:POLL_ANSWER] Error during vote count check, rolled back transaction:`, error);
        throw error;
      }

      // Get the event user to check their vote amount - needed regardless of multiVote
      const eventUser = await findOneById(input.eventUserId);
      if (!eventUser) {
        console.error(`[DEBUG:POLL_ANSWER] Event user ${input.eventUserId} not found!`);
        throw Error("Event user not found!");
      }

      // Calculate total allowed votes
      const totalAllowedVotes = parseInt(eventUser.voteAmount, 10) || 0;

      // HARD BLOCK: If user already has more answers than their allowed votes, block any further submissions
      if (actualAnswerCount > totalAllowedVotes) {
        console.warn(`[WARN:POLL_ANSWER] BLOCKING SUBMISSION: User ${input.eventUserId} already has ${actualAnswerCount} answers which exceeds their limit of ${totalAllowedVotes}`);
        return false;
      }

      // Define isLastAnswerInBallot at a higher scope so it's available later
      const isLastAnswerInBallot = (cloneAnswerObject.answerItemCount === cloneAnswerObject.answerItemLength);

      if (multiVote) {

        // Get current vote cycle for this user to know how many votes they've already used
        const userVotedQuery = await query(
          `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
           WHERE poll_result_id = ? AND event_user_id = ?`,
          [pollResult.id, input.eventUserId]
        );

        // Calculate votes already used
        const voteCycleUsed = Array.isArray(userVotedQuery) && userVotedQuery.length > 0
          ? parseInt(userVotedQuery[0].voteCycle, 10) || 0
          : 0;

        // Calculate how many votes we can actually submit (remaining votes)
        // Use ACTUAL answer count instead of voteCycle for safety
        const requestedVotes = input.voteCycle || 1;
        const remainingVotes = totalAllowedVotes - actualAnswerCount;

        // Stark erhöhte Batch-Größe für bessere Performance bei Load Tests
        // Maximal 500 Stimmen auf einmal abgeben, unabhängig davon, wie viele verbleiben
        // Dies beschleunigt die Verarbeitung bei großen Vote-Batches erheblich
        const MAX_BATCH_SIZE = 500;
        const votesToSubmit = Math.max(0, Math.min(requestedVotes, remainingVotes, MAX_BATCH_SIZE));


        // Only insert votes if we have votes remaining
        if (votesToSubmit > 0) {
          // Variable zur Verfolgung, ob mindestens eine Antwort erfolgreich eingefügt wurde
          let successfulInsert = false;
          for (let index = 1; index <= votesToSubmit; ++index) {
            // One last check before each insertion to avoid race conditions - with transaction
            let currentCount = 0;

            // Start transaction for this check to ensure consistency
            await query("START TRANSACTION", [], { throwError: true });

            try {
              const voteCheck = await query(
                `SELECT vote_cycle AS voteCycle, version 
                  FROM poll_user_voted
                  WHERE poll_result_id = ? AND event_user_id = ?
                  FOR UPDATE`, // Lock the row during check
                [pollResult.id, input.eventUserId]
              );

              if (Array.isArray(voteCheck) && voteCheck.length > 0) {
                const voteCycle = parseInt(voteCheck[0].voteCycle, 10) || 0;
                const version = parseInt(voteCheck[0].version, 10) || 0;
                currentCount = Math.max(voteCycle, version);

                // Fix inconsistency if found
                if (voteCycle !== version) {
                  console.warn(`[WARN:POLL_ANSWER] Found pre-insert discrepancy: voteCycle=${voteCycle}, version=${version}. Fixing to ${currentCount}`);

                  await query(
                    `UPDATE poll_user_voted 
                      SET vote_cycle = ?, version = ?
                      WHERE poll_result_id = ? AND event_user_id = ?`,
                    [currentCount, currentCount, pollResult.id, input.eventUserId]
                  );
                }
              }

              // Check if we would exceed the limit
              if (currentCount > totalAllowedVotes) {
                console.warn(`[WARN:POLL_ANSWER] BLOCKING INSERTION: User ${input.eventUserId} exceeded limit during multi-insertion (${currentCount}/${totalAllowedVotes})`);
                await query("COMMIT", [], { throwError: true }); // Still commit the transaction to release locks
                break;
              }

              // Commit transaction before proceeding with insert
              await query("COMMIT", [], { throwError: true });
            } catch (error) {
              // Rollback in case of any errors
              await query("ROLLBACK", [], { throwError: true });
              console.error(`[ERROR:POLL_ANSWER] Error during pre-insert check, rolled back transaction:`, error);
              break; // Stop insertion on error
            }

            // Für Multi-Vote-Stimmzettel: Vote-Cycle NUR beim letzten Element des Batches erhöhen
            const isLastInBatch = (index === votesToSubmit);

            // Zusätzlich soll das voteComplete-Flag auch überprüfen, ob dies die letzte Antwort
            // des gesamten Stimmzettels ist (answerItemCount === answerItemLength)
            const isLastAnswerInBallot = (cloneAnswerObject.answerItemCount === cloneAnswerObject.answerItemLength);

            // Nur wenn BEIDE Bedingungen erfüllt sind, wird der vote_cycle erhöht
            const voteComplete = isLastInBatch && isLastAnswerInBallot;

            // An die insertPollSubmitAnswer-Funktion das voteComplete-Flag übergeben,
            // damit der vote_cycle nur einmal pro Stimmzettel erhöht wird
            const insertResult = await insertPollSubmitAnswer(input, voteComplete);

            if (insertResult) {
              // Wir merken uns, dass mindestens eine Antwort erfolgreich war
              successfulInsert = true;
            } else {
              console.warn(`[DEBUG:POLL_ANSWER] Vote ${index}/${votesToSubmit} insertion failed`);
            }

            // OPTIMIERT: Komplett entfernte Verzögerung zwischen den Einsätzen für maximale Performance
            // Die Verzögerungslogik wurde vollständig entfernt, um die Verarbeitung zu beschleunigen
            // Dies ist besonders wichtig für Load-Tests mit vielen gleichzeitigen Abstimmungen
          }

          // Verify database changes after insertion
          const verifyVoteQuery = await query(
            `SELECT COUNT(*) AS voteCount FROM poll_answer pa
             JOIN poll_user pu ON pa.poll_user_id = pu.id
             WHERE pa.poll_result_id = ? AND pu.event_user_id = ?`,
            [pollResult.id, input.eventUserId]
          );

          const voteCount = Array.isArray(verifyVoteQuery) && verifyVoteQuery.length > 0
            ? parseInt(verifyVoteQuery[0].voteCount, 10) || 0
            : 0;

          // Der vote_cycle wurde bereits in der insertPollSubmitAnswer-Funktion erhöht,
          // wenn voteComplete=true (beim letzten Element des Batches)
          if (!successfulInsert) {
            console.warn(`[DEBUG:POLL_ANSWER] No votes were successfully inserted`);
          }

          // Also verify the poll_user_voted table was updated
          const verifyVoteCycleQuery = await query(
            `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
             WHERE poll_result_id = ? AND event_user_id = ?`,
            [pollResult.id, input.eventUserId]
          );

          const updatedVoteCycle = Array.isArray(verifyVoteCycleQuery) && verifyVoteCycleQuery.length > 0
            ? parseInt(verifyVoteCycleQuery[0].voteCycle, 10) || 0
            : 0;


          // Bei Multi-Vote sollte der vote_cycle idealerweise nur um 1 erhöht worden sein, nicht um die Anzahl der Antworten
          if (updatedVoteCycle !== voteCycleUsed + 1 && updatedVoteCycle !== 0) {
            console.warn(`[WARN:POLL_ANSWER] Vote cycle was not incremented correctly! Expected: ${voteCycleUsed + 1}, Actual: ${updatedVoteCycle}`);
          }
        } else {
          console.warn(`[WARN:POLL_ANSWER] User ${input.eventUserId} attempted to submit more votes than allowed!`);
        }
      } else {

        await query("START TRANSACTION", [], { throwError: true });

        try {
          let currentCount = 0;
          const voteCheck = await query(
            `SELECT vote_cycle AS voteCycle, version 
              FROM poll_user_voted
              WHERE poll_result_id = ? AND event_user_id = ?
              FOR UPDATE`, // Lock the row during check
            [pollResult.id, input.eventUserId]
          );

          if (Array.isArray(voteCheck) && voteCheck.length > 0) {
            const voteCycle = parseInt(voteCheck[0].voteCycle, 10) || 0;
            const version = parseInt(voteCheck[0].version, 10) || 0;
            currentCount = Math.max(voteCycle, version);

            // Fix inconsistency if found
            if (voteCycle !== version) {
              console.warn(`[WARN:POLL_ANSWER] Found single vote discrepancy: voteCycle=${voteCycle}, version=${version}. Fixing to ${currentCount}`);

              await query(
                `UPDATE poll_user_voted 
                  SET vote_cycle = ?, version = ?
                  WHERE poll_result_id = ? AND event_user_id = ?`,
                [currentCount, currentCount, pollResult.id, input.eventUserId]
              );
            }
          }

          // Check if we would exceed the limit
          if (currentCount > totalAllowedVotes) {
            console.warn(`[WARN:POLL_ANSWER] BLOCKING SINGLE VOTE: User ${input.eventUserId} exceeded limit (${currentCount}/${totalAllowedVotes})`);
            await query("COMMIT", [], { throwError: true }); // Still commit the transaction to release locks
            return false;
          }

          // Commit transaction before proceeding with insert
          await query("COMMIT", [], { throwError: true });
        } catch (error) {
          // Rollback in case of any errors
          await query("ROLLBACK", [], { throwError: true });
          console.error(`[ERROR:POLL_ANSWER] Error during single vote check, rolled back transaction:`, error);
          return false; // Don't insert on error
        }

        // Aktuellen Stimmstatus holen (für die Überprüfung "letzte Stimme")
        const currentVoteCycleQuery = await query(
          `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
           WHERE poll_result_id = ? AND event_user_id = ?`,
          [pollResult.id, input.eventUserId]
        );

        const currentVoteCycle = Array.isArray(currentVoteCycleQuery) && currentVoteCycleQuery.length > 0
          ? parseInt(currentVoteCycleQuery[0].voteCycle, 10) || 0
          : 0;


        // Bei einzelner Abstimmung müssen wir prüfen, ob es die letzte Antwort des Stimmzettels ist
        // Nur dann soll der vote_cycle erhöht werden
        // isLastAnswerInBallot is already defined higher in the scope

        // voteComplete nur setzen, wenn es die letzte Antwort des Stimmzettels ist
        const insertResult = await insertPollSubmitAnswer(input, isLastAnswerInBallot);

        if (!insertResult) {
          console.warn(`[DEBUG:POLL_ANSWER] Single vote insertion failed`);
        }

        // If this is the last answer in ballot, update poll_user_voted
        if (isLastAnswerInBallot) {
          const incrementedVoteCycle = await incrementVoteCycleAfterVote(pollResult.id, input.eventUserId);
          if (!incrementedVoteCycle) {
            console.warn(`[DEBUG:POLL_ANSWER] Increment vote_cycle for single vote failed`);
          }
        }

        // Verify the poll_user_voted table was updated for single vote too
        const verifyVoteCycleQuery = await query(
          `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
           WHERE poll_result_id = ? AND event_user_id = ?`,
          [pollResult.id, input.eventUserId]
        );

        const updatedVoteCycle = Array.isArray(verifyVoteCycleQuery) && verifyVoteCycleQuery.length > 0
          ? parseInt(verifyVoteCycleQuery[0].voteCycle, 10) || 0
          : 0;

      }
      
      // Use async-optimized version for async events
      if (await isAsyncEvent(eventId)) {
        leftAnswersDataSet = await findLeftAnswersCountForAsync(pollResult.id);
      } else {
        leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);
      }

      if (isLastAnswerInBallot) {
        // Again check if there are votes left.
        if (leftAnswersDataSet === null) {
          // First check if the poll is already closed
          const pollStatusCheck = await query(
            "SELECT closed FROM poll_result WHERE id = ?",
            [pollResult.id]
          );

          const isAlreadyClosed = Array.isArray(pollStatusCheck) &&
            pollStatusCheck.length > 0 &&
            pollStatusCheck[0].closed === 1;

          // Auch wenn die Abstimmung bereits geschlossen ist, TROTZDEM das Event veröffentlichen,
          // damit der Client über den Status informiert wird!
          if (isAlreadyClosed) {
            if (eventId) {
              if (pollId) {
                await publishPollClosedEvent(pollResult.id, eventId, pollId);
              } else {
                console.error(`[ERROR:POLL_ANSWER] Could not find poll_id for poll_result ${pollResult.id}`);
              }
            }
          } else {
            await publishPollLifeCycle(pollResult.id);
          }

          return true;
        }
      }
    } else {
      console.warn(`[DEBUG:POLL_ANSWER] Vote NOT allowed for user ${input.eventUserId}, allowToVote=${allowToVote}`);
    }

    if (leftAnswersDataSet) {
      // Notify the organizer about the current voted count.
      // Stellen wir sicher, dass alle erforderlichen Felder mit camelCase vorhanden sind
      pubsub.publish(POLL_ANSWER_LIFE_CYCLE, {
        pollResultId: leftAnswersDataSet.pollResultId || 0,
        maxVotes: leftAnswersDataSet.maxVotes || 0,
        maxVoteCycles: leftAnswersDataSet.maxVoteCycles || 0,
        pollUserVoteCycles: leftAnswersDataSet.pollUserVoteCycles || 0,
        pollUserVotedCount: leftAnswersDataSet.pollUserVotedCount || 0,
        pollAnswersCount: leftAnswersDataSet.pollAnswersCount || 0,
        pollUserCount: leftAnswersDataSet.pollUserCount || 0,
        usersCompletedVoting: leftAnswersDataSet.usersCompletedVoting || 0,
        eventId: eventId
      }, {
        throttleMs: 1000, // Limit to one update per second
        cacheState: true, // Only send if data changed
        filterBy: { pollResultId: leftAnswersDataSet.pollResultId }, // Per-poll throttling
        compareFields: ['pollUserVotedCount', 'pollAnswersCount', 'usersCompletedVoting'] // Critical fields
      });
    } else {
      // If leftAnswersDataSet is null it could be because:
      // 1. The poll is already closed
      // 2. All users have used all their votes (from the findLeftAnswersCount function)
      // 3. There was an error
      // Try to close the poll (if not already closed)

      if (pollResult) {
        const pollStatusCheck = await query(
          "SELECT closed FROM poll_result WHERE id = ?",
          [pollResult.id]
        );

        const isAlreadyClosed = Array.isArray(pollStatusCheck) &&
          pollStatusCheck.length > 0 &&
          pollStatusCheck[0].closed === 1;

        if (!isAlreadyClosed) {
          await publishPollLifeCycle(pollResult.id);
        }
      }
    }
    // WICHTIG: Individual user vote limit check - do NOT close the poll when a single user finishes voting
    // Just log that this particular user has completed their voting
    const atVoteLimit = currentVoteCycle >= totalAllowedVotes;


    if (atVoteLimit && isLastAnswerInBallot) {


      // Check if ALL users have completed their voting
      // We need to count all eligible users and check if all of them have used their votes
      const allUsersQuery = await query(
        `SELECT COUNT(*) AS totalUsers FROM event_user WHERE event_id = ? AND vote_amount > 0`,
        [eventId]
      );

      const votedUsersQuery = await query(
        `SELECT COUNT(*) AS votedUsers FROM poll_user_voted puv
         JOIN event_user eu ON puv.event_user_id = eu.id
         WHERE puv.poll_result_id = ? AND eu.vote_amount > 0 AND puv.vote_cycle >= eu.vote_amount`,
        [pollResult.id]
      );

      const totalEligibleUsers = Array.isArray(allUsersQuery) && allUsersQuery.length > 0
        ? parseInt(allUsersQuery[0].totalUsers, 10) || 0
        : 0;

      const usersCompletedVoting = Array.isArray(votedUsersQuery) && votedUsersQuery.length > 0
        ? parseInt(votedUsersQuery[0].votedUsers, 10) || 0
        : 0;


      // Only close the poll if ALL eligible users have voted (and it's not an async event)
      if (totalEligibleUsers > 0 && usersCompletedVoting >= totalEligibleUsers) {
        if (await isAsyncEvent(eventId)) {
          console.info(`[INFO:POLL_ANSWER] All users completed voting in async event ${eventId}, but NOT closing poll ${pollResult.id}`);
        } else {
          console.info(`[INFO:POLL_ANSWER] All users have completed voting, closing poll ${pollResult.id} in event ${eventId}`);
          await publishPollClosedEvent(pollResult.id, eventId, pollId);
        }
      }

      return true;
    } else if (atVoteLimit) {
      return true;
    }

    return true;
  },

  /**
   * Bulk vote submission for identical votes - optimizes performance when a user
   * submits multiple identical votes at once
   * 
   * @param {Object} _ - GraphQL parent object (not used)
   * @param {Object} args - GraphQL arguments
   * @param {Object} args.input - BulkPollSubmitAnswerInput data
   * @returns {Promise<number>} - Number of votes successfully submitted
   */
  createBulkPollSubmitAnswer: async (_, { input }) => {
    // Generate a unique execution ID for this request for tracking
    const executionId = Math.random().toString(36).substring(2, 10);
    const timestamp = new Date().getTime();

    // Extract poll data
    const pollId = input.pollId;
    const pollResult = await findOneByPollId(input.pollId);
    if (!pollResult) {
      console.error(`[ERROR:BULK_VOTE][${executionId}] Missing poll result for pollId ${input.pollId}`);
      throw Error("Missing poll result record!");
    }

    const eventId = await findEventIdByPollResultId(pollResult.id);
    if (!eventId) {
      console.error(`[ERROR:BULK_VOTE][${executionId}] Missing event for pollResultId ${pollResult.id}`);
      throw Error("Missing related event record!");
    }


    // Check if poll is already closed
    const pollStatusCheck = await query(
      "SELECT closed FROM poll_result WHERE id = ?",
      [pollResult.id]
    );

    const isAlreadyClosed = Array.isArray(pollStatusCheck) &&
      pollStatusCheck.length > 0 &&
      pollStatusCheck[0].closed === 1;

    if (isAlreadyClosed) {
      console.warn(`[WARN:BULK_VOTE][${executionId}] Poll ${pollResult.id} is already closed, cannot submit votes`);
      return 0;
    }

    // OPTIMIERUNG: Implementieren einer Lastverteilung mit Jitter-Verzögerung
    // Bei vielen gleichzeitigen Anfragen fügen wir eine kleine zufällige Verzögerung ein
    // Dies verteilt die Last auf dem SQL-Server und reduziert Locks und Ressourcenkonflikte

    // Berechne eine Verzögerung basierend auf der Benutzer-ID für konsistente Verteilung
    const jitterMs = (input.eventUserId % 10) * 50; // Erzeugt Verzögerungen zwischen 0-450ms
    if (jitterMs > 0) {
      await new Promise(resolve => setTimeout(resolve, jitterMs));
    }

    // Get user data to validate vote limit
    const eventUser = await findOneById(input.eventUserId);
    if (!eventUser) {
      console.error(`[ERROR:BULK_VOTE][${executionId}] Event user ${input.eventUserId} not found!`);
      throw Error("Event user not found!");
    }

    // Validate user is allowed to vote
    if (!eventUser.verified || !eventUser.allowToVote) {
      console.warn(`[WARN:BULK_VOTE][${executionId}] User ${input.eventUserId} is not verified or not allowed to vote`);
      return 0;
    }

    // Check existing vote state for user
    const userVotedQuery = await query(
      `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
       WHERE poll_result_id = ? AND event_user_id = ?`,
      [pollResult.id, input.eventUserId]
    );

    const currentVoteCycle = Array.isArray(userVotedQuery) && userVotedQuery.length > 0
      ? parseInt(userVotedQuery[0].voteCycle, 10) || 0
      : 0;

    // Calculate vote limits
    const maxAllowedVotes = parseInt(eventUser.voteAmount, 10) || 0;
    const remainingVotes = Math.max(0, maxAllowedVotes - currentVoteCycle);

    // Cap requested votes to remaining votes
    const votesToSubmit = Math.min(input.voteCount, remainingVotes);

    if (votesToSubmit <= 0) {
      console.warn(`[WARN:BULK_VOTE][${executionId}] User ${input.eventUserId} has no remaining votes (max: ${maxAllowedVotes}, used: ${currentVoteCycle})`);
      return 0;
    }

    let successfulVotes = 0;

    // Start transaction for the entire bulk operation
    await query("START TRANSACTION", [], { throwError: true });

    try {
      // Create poll user if needed
      await createPollUserIfNeeded(pollResult.id, input.eventUserId);

      // Wichtig: Stelle sicher, dass der poll_user_voted Eintrag existiert
      // (Wenn er nicht existiert, erstelle ihn mit vote_cycle = 0, sodass er später aktualisiert werden kann)
      if (!Array.isArray(userVotedQuery) || userVotedQuery.length === 0) {
        // Hole den Username
        const usernameQuery = await query(
          `SELECT username FROM event_user WHERE id = ?`,
          [input.eventUserId]
        );

        if (Array.isArray(usernameQuery) && usernameQuery.length > 0) {
          const username = usernameQuery[0].username;
          const createDatetime = getCurrentUnixTimeStamp();

          await query(
            `INSERT INTO poll_user_voted 
             (event_user_id, username, poll_result_id, vote_cycle, create_datetime, version)
             VALUES (?, ?, ?, 0, ?, 0)`,
            [input.eventUserId, username, pollResult.id, createDatetime]
          );

        } else {
          console.warn(`[WARN:BULK_VOTE][${executionId}] Could not find username for user ${input.eventUserId}`);
        }
      }

      // Get timestamp for all inserts
      const timestamp = getCurrentUnixTimeStamp();

      // Insert votes in bulk based on poll type
      if (input.type === "PUBLIC") {
        // Get poll user ID for PUBLIC polls
        const pollUserQuery = await query(
          `SELECT poll_user.id FROM poll_user
           INNER JOIN poll_result ON poll_user.poll_id = poll_result.poll_id
           WHERE poll_user.event_user_id = ? AND poll_result.id = ? FOR UPDATE`,
          [input.eventUserId, pollResult.id]
        );

        if (!Array.isArray(pollUserQuery) || pollUserQuery.length === 0) {
          console.error(`[ERROR:BULK_VOTE][${executionId}] Could not find poll_user for eventUserId=${input.eventUserId}, pollResultId=${pollResult.id}`);
          await query("ROLLBACK", [], { throwError: true });
          return 0;
        }

        const pollUserId = pollUserQuery[0].id;

        // Construct bulk insert values
        // For large vote counts, we'll use chunked inserts to avoid extremely long queries
        // OPTIMIERUNG: Passe Chunk-Größe basierend auf der Anzahl der Benutzer an
        // Bei vielen Benutzern verwenden wir kleinere Chunks für bessere Parallelverarbeitung

        // Abfrage der aktiven Benutzer im Event
        const activeUsersQuery = await query(
          `SELECT COUNT(*) AS activeUserCount FROM event_user WHERE event_id = ? AND online = 1`,
          [eventId]
        );

        const activeUserCount = Array.isArray(activeUsersQuery) && activeUsersQuery.length > 0
          ? parseInt(activeUsersQuery[0].activeUserCount, 10) || 0
          : 0;

        // Dynamische Anpassung der Chunk-Größe basierend auf der Anzahl aktiver Benutzer
        const chunkSize = 500; // Standardwert für PUBLIC polls
        const totalChunks = Math.ceil(votesToSubmit / chunkSize);

        for (let chunk = 0; chunk < totalChunks; chunk++) {
          const startIdx = chunk * chunkSize;
          const endIdx = Math.min(startIdx + chunkSize, votesToSubmit);
          const currentBatchSize = endIdx - startIdx;

          // Build the bulk values string for this chunk
          const valuesList = [];
          for (let i = 0; i < currentBatchSize; i++) {
            valuesList.push(`(${pollResult.id}, ${input.possibleAnswerId || 'NULL'}, ${input.answerContent ? `'${input.answerContent.replace(/'/g, "''")}'` : 'NULL'}, ${pollUserId}, ${timestamp})`);
          }

          const bulkValues = valuesList.join(',');

          // Execute the chunked insert
          await query(
            `INSERT INTO poll_answer 
             (poll_result_id, poll_possible_answer_id, answer_content, poll_user_id, create_datetime)
             VALUES ${bulkValues}`,
            []
          );
        }
      } else {
        // SECRET poll bulk insert (without poll_user_id)
        // OPTIMIERUNG: Benutze eine dynamisch berechnete Chunk-Größe
        // Hole aktive Benutzer für die Berechnung der Chunk-Größe
        const activeUsersQuery = await query(
          `SELECT COUNT(*) AS activeUserCount FROM event_user WHERE event_id = ? AND online = 1`,
          [eventId]
        );

        const activeUserCount = Array.isArray(activeUsersQuery) && activeUsersQuery.length > 0
          ? parseInt(activeUsersQuery[0].activeUserCount, 10) || 0
          : 0;

        // Dynamische Anpassung der Chunk-Größe basierend auf der Anzahl aktiver Benutzer
        let chunkSize = 500; // Standardwert

        if (activeUserCount > 100) {
          // Bei mehr als 100 aktiven Benutzern verkleinern wir die Chunks erheblich
          chunkSize = 200;
        } else if (activeUserCount > 50) {
          // Bei mehr als 50 aktiven Benutzern verkleinern wir die Chunks moderat
          chunkSize = 300;
        }

        const totalChunks = Math.ceil(votesToSubmit / chunkSize);

        for (let chunk = 0; chunk < totalChunks; chunk++) {
          const startIdx = chunk * chunkSize;
          const endIdx = Math.min(startIdx + chunkSize, votesToSubmit);
          const currentBatchSize = endIdx - startIdx;

          // Build the bulk values string for this chunk
          const valuesList = [];
          for (let i = 0; i < currentBatchSize; i++) {
            valuesList.push(`(${pollResult.id}, ${input.possibleAnswerId || 'NULL'}, ${input.answerContent ? `'${input.answerContent.replace(/'/g, "''")}'` : 'NULL'}, ${timestamp})`);
          }

          const bulkValues = valuesList.join(',');

          // Execute the chunked insert
          await query(
            `INSERT INTO poll_answer 
             (poll_result_id, poll_possible_answer_id, answer_content, create_datetime)
             VALUES ${bulkValues}`,
            []
          );
        }
      }

      // Verify inserts by counting (kein Lock notwendig, nur für Logging)
      const verifyInsertQuery = await query(
        `SELECT COUNT(*) AS insertCount 
         FROM poll_answer 
         WHERE poll_result_id = ? AND create_datetime = ?`,
        [pollResult.id, timestamp]
      );

      const insertCount = Array.isArray(verifyInsertQuery) && verifyInsertQuery.length > 0
        ? parseInt(verifyInsertQuery[0].insertCount, 10) || 0
        : 0;

      if (insertCount < votesToSubmit) {
        console.warn(`[WARN:BULK_VOTE][${executionId}] Expected to insert ${votesToSubmit} votes, but only found ${insertCount}`);
      }

      // OPTIMIERUNG: VoteCycle direkt in derselben Transaktion aktualisieren
      // anstatt eine neue Transaktion über incrementVoteCycleAfterVote zu starten
      const incrementBy = insertCount > 0 ? insertCount : 1; // Mindestens 1, um konsistent zu bleiben

      try {
        // Hole maximale Stimmanzahl des Benutzers ohne FOR UPDATE
        const userQuery = await query(
          `SELECT vote_amount AS voteAmount FROM event_user WHERE id = ?`,
          [input.eventUserId]
        );

        const maxVotes = Array.isArray(userQuery) && userQuery.length > 0
          ? parseInt(userQuery[0].voteAmount, 10) || 0
          : 0;

        // Aktuelle Stimmen des Benutzers ohne FOR UPDATE
        const voteQuery = await query(
          `SELECT vote_cycle AS voteCycle, version 
           FROM poll_user_voted
           WHERE poll_result_id = ? AND event_user_id = ?`,
          [pollResult.id, input.eventUserId]
        );

        if (Array.isArray(voteQuery) && voteQuery.length > 0) {
          const currentVoteCycle = parseInt(voteQuery[0].voteCycle, 10) || 0;
          const currentVersion = parseInt(voteQuery[0].version, 10) || 0;

          // Entweder erhöhen oder auf Maximum setzen
          if (currentVoteCycle + incrementBy <= maxVotes) {
            // Direkte Aktualisierung ohne erneute Prüfung mit FOR UPDATE
            await query(
              `UPDATE poll_user_voted
               SET vote_cycle = vote_cycle + ?, version = version + ?
               WHERE poll_result_id = ? AND event_user_id = ?`,
              [incrementBy, incrementBy, pollResult.id, input.eventUserId]
            );
          } else if (currentVoteCycle < maxVotes) {
            // Auf Maximum setzen
            const remainingVotes = maxVotes - currentVoteCycle;
            await query(
              `UPDATE poll_user_voted
               SET vote_cycle = ?, version = ?
               WHERE poll_result_id = ? AND event_user_id = ?`,
              [maxVotes, maxVotes, pollResult.id, input.eventUserId]
            );
          } else {
            console.warn(`[WARN:BULK_VOTE][${executionId}] User ${input.eventUserId} already at maximum votes ${maxVotes}`);
          }
        } else {
          console.warn(`[WARN:BULK_VOTE][${executionId}] Could not find vote_cycle record to update`);
        }
      } catch (updateError) {
        console.error(`[ERROR:BULK_VOTE][${executionId}] Error updating vote cycle: ${updateError.message}`);
        throw updateError; // Re-throw to be caught by the outer try-catch
      }

      // Commit transaction
      await query("COMMIT", [], { throwError: true });
      successfulVotes = insertCount;

      // Explizite Debug-Ausgabe nach erfolgreicher Verarbeitung
      const endTimestamp = new Date().getTime();
      const duration = Math.max(0, endTimestamp - timestamp); // Stelle sicher, dass wir keine negativen Werte erhalten


      // Get updated poll answer counts for notification
      const leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);

      if (leftAnswersDataSet) {
        // Notify subscribers about updated vote counts
        pubsub.publish(POLL_ANSWER_LIFE_CYCLE, {
          pollResultId: leftAnswersDataSet.pollResultId || 0,
          maxVotes: leftAnswersDataSet.maxVotes || 0,
          maxVoteCycles: leftAnswersDataSet.maxVoteCycles || 0,
          pollUserVoteCycles: leftAnswersDataSet.pollUserVoteCycles || 0,
          pollUserVotedCount: leftAnswersDataSet.pollUserVotedCount || 0,
          pollAnswersCount: leftAnswersDataSet.pollAnswersCount || 0,
          pollUserCount: leftAnswersDataSet.pollUserCount || 0,
          usersCompletedVoting: leftAnswersDataSet.usersCompletedVoting || 0,
          eventId: eventId
        }, {
          throttleMs: 1000, // Limit to one update per second
          cacheState: true, // Only send if data changed
          filterBy: { pollResultId: leftAnswersDataSet.pollResultId }, // Per-poll throttling
          compareFields: ['pollUserVotedCount', 'pollAnswersCount', 'usersCompletedVoting'] // Critical fields
        });

        // Check if this was the user's last vote
        const newVoteCycleQuery = await query(
          `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
           WHERE poll_result_id = ? AND event_user_id = ?`,
          [pollResult.id, input.eventUserId]
        );

        const newVoteCycle = Array.isArray(newVoteCycleQuery) && newVoteCycleQuery.length > 0
          ? parseInt(newVoteCycleQuery[0].voteCycle, 10) || 0
          : 0;

        // If user has reached vote limit, check if all users have completed voting
        if (newVoteCycle >= maxAllowedVotes) {
          // Check if ALL users have completed their voting
          const allUsersQuery = await query(
            `SELECT COUNT(*) AS totalUsers FROM event_user WHERE event_id = ? AND vote_amount > 0`,
            [eventId]
          );

          const votedUsersQuery = await query(
            `SELECT COUNT(*) AS votedUsers FROM poll_user_voted puv
             JOIN event_user eu ON puv.event_user_id = eu.id
             WHERE puv.poll_result_id = ? AND eu.vote_amount > 0 AND puv.vote_cycle >= eu.vote_amount`,
            [pollResult.id]
          );

          const totalEligibleUsers = Array.isArray(allUsersQuery) && allUsersQuery.length > 0
            ? parseInt(allUsersQuery[0].totalUsers, 10) || 0
            : 0;

          const usersCompletedVoting = Array.isArray(votedUsersQuery) && votedUsersQuery.length > 0
            ? parseInt(votedUsersQuery[0].votedUsers, 10) || 0
            : 0;

          // Only close the poll if ALL eligible users have voted (and it's not an async event)
          if (totalEligibleUsers > 0 && usersCompletedVoting >= totalEligibleUsers) {
            if (await isAsyncEvent(eventId)) {
              console.info(`[INFO:BULK_VOTE] All users completed voting in async event ${eventId}, but NOT closing poll ${pollResult.id}`);
            } else {
              await publishPollClosedEvent(pollResult.id, eventId, pollId);
            }
          }
        }
      } else {
        // leftAnswersDataSet is null - poll might be closed now
        await publishPollLifeCycle(pollResult.id);
      }

      return successfulVotes;
    } catch (error) {
      // Rollback on any error
      await query("ROLLBACK", [], { throwError: true });
      console.error(`[ERROR:BULK_VOTE][${executionId}] Transaction error:`, error);
      return 0;
    }
  },
};
