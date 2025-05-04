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
import { query } from "../../../lib/database";

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
  
  console.log(`[DEBUG:POLL_LIFECYCLE] Publishing poll close event for poll ${pollResultId}, event ${eventId}`);
  
  // Kritisch: Stelle sicher, dass das Event vollständige Informationen enthält, damit der Client es korrekt verarbeiten kann
  const pollQuery = await query("SELECT poll_id AS pollId FROM poll_result WHERE id = ?", [pollResultId]);
  const pollId = Array.isArray(pollQuery) && pollQuery.length > 0 ? pollQuery[0].pollId : null;
  
  if (!pollId) {
    console.error(`[ERROR:POLL_LIFECYCLE] Could not find poll_id for poll_result ${pollResultId}`);
    return;
  }
  
  // Vollständiges Poll-Objekt abrufen
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
  
  if (!completePoll) {
    console.error(`[ERROR:POLL_LIFECYCLE] Could not find complete poll data for poll ${pollId}`);
    return;
  }
  
  // Füge die möglichen Antworten hinzu
  completePoll.possibleAnswers = possibleAnswers;
  
  // Wichtig: Alle PubSub-Events benötigen vollständige Poll-Daten, um korrekt im Client verarbeitet zu werden
  pubsub.publish(POLL_LIFE_CYCLE, {
    eventId: eventId,
    state: "closed",
    poll: completePoll,
    pollResultId: pollResultId
  });
  
  console.log(`[DEBUG:POLL_LIFECYCLE] Poll close event published for poll ${pollResultId} with poll_id=${pollId}`);
}

export default {
  // todo refactor + document the logic here.
  createPollSubmitAnswer: async (_, { input }) => {
    console.log(`[DEBUG:POLL_ANSWER] Received createPollSubmitAnswer with input:`, JSON.stringify({
      eventUserId: input.eventUserId,
      pollId: input.pollId,
      type: input.type,
      voteCycle: input.voteCycle,
      multivote: input.multivote,
      answerItemLength: input.answerItemLength,
      answerItemCount: input.answerItemCount
    }));
    
    const cloneAnswerObject = {};
    const pollResult = await findOneByPollId(input.pollId);
    if (!pollResult) {
      console.error(`[DEBUG:POLL_ANSWER] Error: Missing poll result for pollId ${input.pollId}`);
      throw Error("Missing poll result record!");
    }
    console.log(`[DEBUG:POLL_ANSWER] Found pollResult:`, JSON.stringify({
      id: pollResult.id,
      pollId: pollResult.poll_id
    }));
    
    const eventId = await findEventIdByPollResultId(pollResult.id);
    if (!eventId) {
      console.error(`[DEBUG:POLL_ANSWER] Error: Missing event for pollResultId ${pollResult.id}`);
      throw Error("Missing related event record!");
    }
    console.log(`[DEBUG:POLL_ANSWER] Found eventId: ${eventId}`);
    
    input.pollResultId = pollResult.id; // fixme This is a quick fix because the following code relies on the now missing input.pollResultId.
    Object.assign(cloneAnswerObject, input);
    delete input.answerItemCount;
    delete input.answerItemLength;
    
    let leftAnswersDataSet = null;
    let allowToVote = true;
    const multivoteType = await getMultivoteType(eventId);
    const multiVote = multivoteType === 2 || input.multivote;
    console.log(`[DEBUG:POLL_ANSWER] MultiVote settings - multivoteType: ${multivoteType}, input.multivote: ${input.multivote}, final multiVote: ${multiVote}`);
    
    // Check existing vote state for user
    const userVotedQuery = await query(
      `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
       WHERE poll_result_id = ? AND event_user_id = ?`,
      [pollResult.id, input.eventUserId]
    );
    const currentVoteCycle = Array.isArray(userVotedQuery) && userVotedQuery.length > 0 
      ? parseInt(userVotedQuery[0].voteCycle, 10) || 0 
      : 0;
    console.log(`[DEBUG:POLL_ANSWER] Current vote state - eventUserId: ${input.eventUserId}, currentVoteCycle: ${currentVoteCycle}`);
    
    // Get user's total allowed votes
    const eventUser = await findOneById(input.eventUserId);
    const totalAllowedVotes = eventUser ? parseInt(eventUser.voteAmount, 10) || 0 : 0;
    console.log(`[DEBUG:POLL_ANSWER] User vote limits - totalAllowedVotes: ${totalAllowedVotes}, remainingVotes: ${totalAllowedVotes - currentVoteCycle}`);
    
    if (
      cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount
    ) {
      console.log(`[DEBUG:POLL_ANSWER] Processing final item in batch - answerItemCount: ${cloneAnswerObject.answerItemCount}/${cloneAnswerObject.answerItemLength}`);
      
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
          console.log(`[DEBUG:POLL_ANSWER] Poll ${pollResult.id} is already closed, but still publishing event to update clients`);
          
          // Direkt das PubSub-Event senden, ohne erneut zu schließen
          const eventId = await findEventIdByPollResultId(pollResult.id);
          if (eventId) {
            const pollQuery = await query("SELECT poll_id AS pollId FROM poll_result WHERE id = ?", [pollResult.id]);
            const pollId = Array.isArray(pollQuery) && pollQuery.length > 0 ? pollQuery[0].pollId : null;
            
            console.log(`[DEBUG:POLL_ANSWER] Publishing poll close event for already closed poll ${pollResult.id}`);
            pubsub.publish(POLL_LIFE_CYCLE, {
              eventId: eventId,
              state: "closed",
              poll: { id: pollId }
            });
            console.log(`[DEBUG:POLL_ANSWER] Event published for already closed poll ${pollResult.id}`);
          }
        } else {
          console.log(`[DEBUG:POLL_ANSWER] Publishing poll life cycle event to close poll ${pollResult.id}`);
          await publishPollLifeCycle(pollResult.id);
        }
        
        return false;
      }
      
      console.log(`[DEBUG:POLL_ANSWER] Checking if user can vote - pollResultId: ${pollResult.id}, eventUserId: ${input.eventUserId}, multiVote: ${multiVote}, requestedVotes: ${input.voteCycle || 1}`);
      allowToVote = await existsPollUserVoted(
        pollResult.id,
        input.eventUserId,
        multiVote,
        input // Übergebe den gesamten input, damit voteCycle verfügbar ist
      );
      console.log(`[DEBUG:POLL_ANSWER] Vote permission result: ${allowToVote ? 'ALLOWED' : 'DENIED'}`);
    }
    if (allowToVote) {
      console.log(`[DEBUG:POLL_ANSWER] Vote allowed, setting up poll user if needed`);
      await createPollUserIfNeeded(pollResult.id, input.eventUserId);

      // CRITICAL: First get count of actual votes already cast
      // For PUBLIC polls we can count poll_answer records joined with poll_user
      // For SECRET polls we need to use the vote_cycle from poll_user_voted as our source of truth
      let actualAnswerCount = 0;
      
      // Start transaction to ensure consistent state during counting and validation
      console.log(`[DEBUG:POLL_ANSWER] Starting transaction for vote count check`);
      await query("START TRANSACTION");
      
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
            
          console.log(`[DEBUG:POLL_ANSWER] Using direct poll_answer count for PUBLIC poll: ${actualAnswerCount} (with transaction lock)`);
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
            
            console.log(`[DEBUG:POLL_ANSWER] Using vote_cycle/version as count for SECRET poll: voteCycle=${voteCycle}, version=${version}, final count=${actualAnswerCount} (with transaction lock)`);
            
            // If vote_cycle and version are out of sync, try to fix them
            if (voteCycle !== version) {
              console.warn(`[WARN:POLL_ANSWER] Found discrepancy between vote_cycle (${voteCycle}) and version (${version}). Attempting to sync them to ${actualAnswerCount}`);
              
              // Update both to the higher value for consistency
              await query(
                `UPDATE poll_user_voted 
                 SET vote_cycle = ?, version = ?
                 WHERE poll_result_id = ? AND event_user_id = ?`,
                [actualAnswerCount, actualAnswerCount, pollResult.id, input.eventUserId]
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
        await query("COMMIT");
        console.log(`[DEBUG:POLL_ANSWER] Committed transaction for vote count check`);
      } catch (error) {
        // Rollback in case of any errors
        await query("ROLLBACK");
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
      
      console.log(`[DEBUG:POLL_ANSWER] STRICT VOTE LIMIT CHECK: Total allowed=${totalAllowedVotes}, Actual current answers=${actualAnswerCount}`);
      
      // HARD BLOCK: If user already has more answers than their allowed votes, block any further submissions
      if (actualAnswerCount > totalAllowedVotes) {
        console.warn(`[WARN:POLL_ANSWER] BLOCKING SUBMISSION: User ${input.eventUserId} already has ${actualAnswerCount} answers which exceeds their limit of ${totalAllowedVotes}`);
        return false;
      }
      
      if (multiVote) {
        console.log(`[DEBUG:POLL_ANSWER] Processing multiVote flow`);
        
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
        const votesToSubmit = Math.max(0, Math.min(requestedVotes, remainingVotes));
        
        console.log(`[DEBUG:POLL_ANSWER] MultiVote calculation: Total allowed=${totalAllowedVotes}, Already used=${actualAnswerCount}, Requested=${requestedVotes}, Remaining=${remainingVotes}, Will submit=${votesToSubmit}`);
        
        // Only insert votes if we have votes remaining
        if (votesToSubmit > 0) {
          console.log(`[DEBUG:POLL_ANSWER] Inserting ${votesToSubmit} votes for user ${input.eventUserId}`);
          for (let index = 1; index <= votesToSubmit; ++index) {
            // One last check before each insertion to avoid race conditions - with transaction
            let currentCount = 0;
            
            // Start transaction for this check to ensure consistency
            await query("START TRANSACTION");
            
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
                await query("COMMIT"); // Still commit the transaction to release locks
                break;
              }
              
              // Commit transaction before proceeding with insert
              await query("COMMIT");
            } catch (error) {
              // Rollback in case of any errors
              await query("ROLLBACK");
              console.error(`[ERROR:POLL_ANSWER] Error during pre-insert check, rolled back transaction:`, error);
              break; // Stop insertion on error
            }
            
            console.log(`[DEBUG:POLL_ANSWER] Inserting vote ${index}/${votesToSubmit} (current count: ${currentCount}/${totalAllowedVotes})`);
            await insertPollSubmitAnswer(input);
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
            
          console.log(`[DEBUG:POLL_ANSWER] After insertion, total vote count in database: ${voteCount}`);
          
          // Also verify the poll_user_voted table was updated
          const verifyVoteCycleQuery = await query(
            `SELECT vote_cycle AS voteCycle FROM poll_user_voted 
             WHERE poll_result_id = ? AND event_user_id = ?`,
            [pollResult.id, input.eventUserId]
          );
          
          const updatedVoteCycle = Array.isArray(verifyVoteCycleQuery) && verifyVoteCycleQuery.length > 0 
            ? parseInt(verifyVoteCycleQuery[0].voteCycle, 10) || 0 
            : 0;
            
          console.log(`[DEBUG:POLL_ANSWER] After insertion, vote_cycle in poll_user_voted: ${updatedVoteCycle}`);
          
          if (updatedVoteCycle !== voteCycleUsed + votesToSubmit && updatedVoteCycle !== 0) {
            console.warn(`[WARN:POLL_ANSWER] Vote cycle was not incremented correctly! Expected: ${voteCycleUsed + votesToSubmit}, Actual: ${updatedVoteCycle}`);
          }
        } else {
          console.warn(`[WARN:POLL_ANSWER] User ${input.eventUserId} attempted to submit more votes than allowed!`);
        }
      } else {
        console.log(`[DEBUG:POLL_ANSWER] Processing single vote flow`);
        
        // One final check before insertion to avoid race conditions - with transaction
        console.log(`[DEBUG:POLL_ANSWER] Starting transaction for single vote final check`);
        await query("START TRANSACTION");
        
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
              
            console.log(`[DEBUG:POLL_ANSWER] Single vote final check for PUBLIC poll: currentCount=${currentCount}/${totalAllowedVotes}`);
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
            await query("COMMIT"); // Still commit the transaction to release locks
            return false;
          }
          
          // Commit transaction before proceeding with insert
          await query("COMMIT");
          console.log(`[DEBUG:POLL_ANSWER] Committed transaction for single vote check, proceeding with insert`);
        } catch (error) {
          // Rollback in case of any errors
          await query("ROLLBACK");
          console.error(`[ERROR:POLL_ANSWER] Error during single vote check, rolled back transaction:`, error);
          return false; // Don't insert on error
        }
        
        // For single vote, insert only if we haven't exceeded the limit
        console.log(`[DEBUG:POLL_ANSWER] Inserting single vote for user ${input.eventUserId}`);
        await insertPollSubmitAnswer(input);
        
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
      
      leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);
      console.log(`[DEBUG:POLL_ANSWER] Checking remaining answers - leftAnswersDataSet:`, leftAnswersDataSet ? JSON.stringify(leftAnswersDataSet) : 'null');
      
      if (
        cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount
      ) {
        console.log(`[DEBUG:POLL_ANSWER] Processing final answer in sequence`);
        // Again check if there are votes left.
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
            console.log(`[DEBUG:POLL_ANSWER] Poll ${pollResult.id} is already closed, but still publishing event to update clients`);
            
            // Direkt das PubSub-Event senden, ohne erneut zu schließen
            const eventId = await findEventIdByPollResultId(pollResult.id);
            if (eventId) {
              // Erst vollständige Poll-Daten abrufen
              const pollQuery = await query("SELECT poll_id AS pollId FROM poll_result WHERE id = ?", [pollResult.id]);
              const pollId = Array.isArray(pollQuery) && pollQuery.length > 0 ? pollQuery[0].pollId : null;
              
              if (pollId) {
                // Vollständiges Poll-Objekt abrufen
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
                
                if (completePoll) {
                  // Füge die möglichen Antworten hinzu
                  completePoll.possibleAnswers = possibleAnswers;
                  
                  console.log(`[DEBUG:POLL_ANSWER] Publishing poll close event for already closed poll ${pollResult.id} with complete poll data`);
                  pubsub.publish(POLL_LIFE_CYCLE, {
                    eventId: eventId,
                    state: "closed",
                    poll: completePoll,
                    pollResultId: pollResult.id
                  });
                  console.log(`[DEBUG:POLL_ANSWER] Event published for already closed poll ${pollResult.id}`);
                } else {
                  console.error(`[ERROR:POLL_ANSWER] Could not find complete poll data for poll ${pollId}`);
                }
              } else {
                console.error(`[ERROR:POLL_ANSWER] Could not find poll_id for poll_result ${pollResult.id}`);
              }
            }
          } else {
            console.log(`[DEBUG:POLL_ANSWER] Publishing poll life cycle event to close poll ${pollResult.id}`);
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
        eventId: eventId
      });
    }
    return true;
  },
};
