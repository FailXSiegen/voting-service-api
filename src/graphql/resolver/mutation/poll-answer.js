import { insertPollSubmitAnswer } from "../../../repository/poll/poll-answer-repository";
import {
  findLeftAnswersCount,
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
  pubsub.publish(POLL_LIFE_CYCLE, {
    eventId: eventId,
    state: "closed",
    poll: completePoll,
    pollResultId: pollResultId
  });

  console.log(`[DEBUG:POLL_LIFECYCLE] Poll close event published for poll ${pollResultId} with poll_id=${pollId}`);
}


async function publishPollLifeCycle(pollResultId) {
  // Close the poll and verify it was closed successfully
  await closePollResult(pollResultId);

  // Verify the poll was actually closed
  const verifyCloseQuery = await query("SELECT closed FROM poll_result WHERE id = ?", [pollResultId]);
  if (Array.isArray(verifyCloseQuery) && verifyCloseQuery.length > 0) {
    console.log(`[DEBUG:POLL_LIFECYCLE] Poll closed status after update: ${verifyCloseQuery[0].closed}`);
  } else {
    console.warn(`[WARN:POLL_LIFECYCLE] Could not verify poll ${pollResultId} was closed`);
  }

  const eventId = await findEventIdByPollResultId(pollResultId);
  if (!eventId) {
    console.warn(
      'Could not execute publishPollLifeCycle. Missing "eventId" or "pollResultId"',
      { pollResultId, eventId },
    );
    return;
  }

  await publishPollClosedEvent(pollResultId, eventId);
}

export default {
  // todo refactor + document the logic here.
  createPollSubmitAnswer: async (_, { input }) => {

    const cloneAnswerObject = {};
    const pollId = input.pollId;
    const pollResult = await findOneByPollId(input.pollId);
    if (!pollResult) {
      console.error(`[DEBUG:POLL_ANSWER] Error: Missing poll result for pollId ${input.pollId}`);
      throw Error("Missing poll result record!");
    }

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
      leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);
      if (leftAnswersDataSet === null) {
        console.log(`[DEBUG:POLL_ANSWER] No answers left, closing poll`);

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
              });
            }
          }
        } else {
          console.log(`[DEBUG:POLL_ANSWER] Publishing poll life cycle event to close poll ${pollResult.id}`);
          await publishPollLifeCycle(pollResult.id);
        }

        return false;
      }

      allowToVote = await existsPollUserVoted(
        pollResult.id,
        input.eventUserId,
        multiVote,
        input // Übergebe den gesamten input, damit voteCycle verfügbar ist
      );

    }
    if (allowToVote) {
      await createPollUserIfNeeded(pollResult.id, input.eventUserId);
      let actualAnswerCount = 0;
      await query("START TRANSACTION", [], { throwError: true });
      try {
        if (input.type === "PUBLIC") {
          // For PUBLIC polls we can directly count the answers with a lock
          const actualAnswerQuery = await query(
            `SELECT COUNT(*) AS answerCount FROM poll_answer pa
             JOIN poll_user pu ON pa.poll_user_id = pu.id
             WHERE pa.poll_result_id = ? AND pu.event_user_id = ?
             FOR UPDATE`,
            [pollResult.id, input.eventUserId]
          );

          actualAnswerCount = Array.isArray(actualAnswerQuery) && actualAnswerQuery.length > 0
            ? parseInt(actualAnswerQuery[0].answerCount, 10) || 0
            : 0;

        } else {
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

              if (Array.isArray(verifySync) && verifySync.length > 0) {
                console.log(`[DEBUG:POLL_ANSWER] After sync: voteCycle=${verifySync[0].voteCycle}, version=${verifySync[0].version}`);
              }
            }
          } else {
            console.log(`[DEBUG:POLL_ANSWER] No vote_cycle record found for SECRET poll, using count=0`);
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

        // WICHTIG: Stark reduzierte Batch-Größe, um die Datenbankverbindungen zu entlasten
        // Maximal 2 Stimmen auf einmal abgeben, unabhängig davon, wie viele verbleiben
        const MAX_BATCH_SIZE = 2;
        const votesToSubmit = Math.max(0, Math.min(requestedVotes, remainingVotes, MAX_BATCH_SIZE));

        console.log(`[DEBUG:POLL_ANSWER] MultiVote calculation: Total allowed=${totalAllowedVotes}, Already used=${actualAnswerCount}, Requested=${requestedVotes}, Remaining=${remainingVotes}, Batch limit=${MAX_BATCH_SIZE}, Will submit=${votesToSubmit}`);

        // Only insert votes if we have votes remaining
        if (votesToSubmit > 0) {
          console.log(`[DEBUG:POLL_ANSWER] Inserting ${votesToSubmit} votes for user ${input.eventUserId} (batch limited to ${MAX_BATCH_SIZE})`);
          // Variable zur Verfolgung, ob mindestens eine Antwort erfolgreich eingefügt wurde
          let successfulInsert = false;
          for (let index = 1; index <= votesToSubmit; ++index) {
            // One last check before each insertion to avoid race conditions - with transaction
            let currentCount = 0;

            // Start transaction for this check to ensure consistency
            await query("START TRANSACTION", [], { throwError: true });

            try {
              if (input.type === "PUBLIC") {
                const finalCheck = await query(
                  `SELECT COUNT(*) AS answerCount FROM poll_answer pa
                   JOIN poll_user pu ON pa.poll_user_id = pu.id
                   WHERE pa.poll_result_id = ? AND pu.event_user_id = ?
                   FOR UPDATE`, // Lock the rows during check
                  [pollResult.id, input.eventUserId]
                );

                currentCount = Array.isArray(finalCheck) && finalCheck.length > 0
                  ? parseInt(finalCheck[0].answerCount, 10) || 0
                  : 0;

                console.log(`[DEBUG:POLL_ANSWER] Pre-insert check for PUBLIC poll: currentCount=${currentCount}/${totalAllowedVotes}`);
              } else {
                // For SECRET polls, check vote_cycle
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

                  console.log(`[DEBUG:POLL_ANSWER] Pre-insert check for SECRET poll: voteCycle=${voteCycle}, version=${version}, using max=${currentCount}/${totalAllowedVotes}`);

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
                } else {
                  console.log(`[DEBUG:POLL_ANSWER] No vote record found in final check, using count=0`);
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

            console.log(`[DEBUG:POLL_ANSWER] Submitting answer ${cloneAnswerObject.answerItemCount}/${cloneAnswerObject.answerItemLength}, isLastInBatch=${isLastInBatch}, isLastAnswerInBallot=${isLastAnswerInBallot}, voteComplete=${voteComplete}`);

            // An die insertPollSubmitAnswer-Funktion das voteComplete-Flag übergeben,
            // damit der vote_cycle nur einmal pro Stimmzettel erhöht wird
            const insertResult = await insertPollSubmitAnswer(input, voteComplete);

            if (insertResult) {
              console.log(`[DEBUG:POLL_ANSWER] Vote ${index}/${votesToSubmit} successfully inserted`);
              // Wir merken uns, dass mindestens eine Antwort erfolgreich war
              successfulInsert = true;
            } else {
              console.warn(`[DEBUG:POLL_ANSWER] Vote ${index}/${votesToSubmit} insertion failed`);
            }

            // Verlängerte Verzögerung zwischen den Einsätzen einfügen, um die Datenbankverbindungen zu schonen
            if (index < votesToSubmit) {
              await new Promise(resolve => setTimeout(resolve, 250)); // 250ms Verzögerung
            }
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
          if (successfulInsert) {
            console.log(`[DEBUG:POLL_ANSWER] At least one vote was successfully inserted`);
          } else {
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

          if (input.type === "PUBLIC") {
            const finalSingleCheck = await query(
              `SELECT COUNT(*) AS answerCount FROM poll_answer pa
               JOIN poll_user pu ON pa.poll_user_id = pu.id
               WHERE pa.poll_result_id = ? AND pu.event_user_id = ?
               FOR UPDATE`, // Lock the rows during check
              [pollResult.id, input.eventUserId]
            );

            currentCount = Array.isArray(finalSingleCheck) && finalSingleCheck.length > 0
              ? parseInt(finalSingleCheck[0].answerCount, 10) || 0
              : 0;

          } else {
            // For SECRET polls, check vote_cycle
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

              console.log(`[DEBUG:POLL_ANSWER] Single vote final check for SECRET poll: voteCycle=${voteCycle}, version=${version}, using max=${currentCount}/${totalAllowedVotes}`);

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
            } else {
              console.log(`[DEBUG:POLL_ANSWER] No vote record found in single vote check, using count=0`);
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
        const isLastAnswerInBallot = (cloneAnswerObject.answerItemCount === cloneAnswerObject.answerItemLength);

        console.log(`[DEBUG:POLL_ANSWER] Single vote: Processing answer ${cloneAnswerObject.answerItemCount}/${cloneAnswerObject.answerItemLength}, isLastAnswerInBallot=${isLastAnswerInBallot}`);

        // voteComplete nur setzen, wenn es die letzte Antwort des Stimmzettels ist
        const insertResult = await insertPollSubmitAnswer(input, isLastAnswerInBallot);

        if (insertResult) {
          console.log(`[DEBUG:POLL_ANSWER] Single vote successfully inserted with vote_cycle increment in same transaction`);
        } else {
          console.warn(`[DEBUG:POLL_ANSWER] Single vote insertion failed`);
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

        console.log(`[DEBUG:POLL_ANSWER] After single vote insertion, vote_cycle in poll_user_voted: ${updatedVoteCycle}`);
      }
      const isLastAnswerInBallot = (cloneAnswerObject.answerItemCount === cloneAnswerObject.answerItemLength);
      if (isLastAnswerInBallot) {
        const incrementedVoteCycle = await incrementVoteCycleAfterVote(pollResult.id, input.eventUserId);
        if (!incrementedVoteCycle) {
          console.warn(`[DEBUG:POLL_ANSWER] Increment vote_cycle for single vote after insertPollSubmitAnswer failed`);
        }
      }
      leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);
      console.log(`[DEBUG:POLL_ANSWER] Checking remaining answers - leftAnswersDataSet:`, leftAnswersDataSet ? JSON.stringify(leftAnswersDataSet) : 'null');

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
      console.warn(`[DEBUG:POLL_ANSWER] Vote NOT allowed for user ${input.eventUserId}`);
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
          console.log(`[DEBUG:POLL_ANSWER] Poll ${pollResult.id} not closed yet, publishing close event`);
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


      // Only close the poll if ALL eligible users have voted
      if (totalEligibleUsers > 0 && usersCompletedVoting >= totalEligibleUsers) {
        await publishPollClosedEvent(pollResult.id, eventId, pollId);
      }

      return true;
    } else if (atVoteLimit) {
      return true;
    }

    return true;
  },
};
