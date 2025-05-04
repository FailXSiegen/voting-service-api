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

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_answer", input);
}

export async function update(input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp();
  await updateQuery("poll_answer", input);
}

export async function remove(id) {
  return await removeQuery("poll_answer", id);
}

/**
 * Inserts a poll answer while ensuring vote limits are not exceeded
 * Uses transactions for atomicity and consistency
 * @param {Object} input Input data with pollId, pollResultId, eventUserId, type, etc.
 * @returns {Promise<Object|null>} The insertion result or null if failed
 */
export async function insertPollSubmitAnswer(input) {
  console.log(`[DEBUG:INSERT_ANSWER] Starting insertPollSubmitAnswer with pollResultId=${input.pollResultId}, eventUserId=${input.eventUserId}, type=${input.type}`);
  
  try {
    // Start transaction to ensure atomicity
    console.log(`[DEBUG:INSERT_ANSWER] Starting transaction`);
    await query("START TRANSACTION");
    
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
        await query("ROLLBACK");
        return null;
      }
      
      const pollMaxVotes = parseInt(pollQuery[0].maxVotes, 10) || 0;
      const pollCurrentVotes = parseInt(pollQuery[0].currentAnswersCount, 10) || 0;
      const isClosed = pollQuery[0].closed === 1;
      
      console.log(`[DEBUG:INSERT_ANSWER] Poll status: maxVotes=${pollMaxVotes}, currentVotes=${pollCurrentVotes}, closed=${isClosed}`);
      
      // If poll is closed or at max votes, block the insertion
      if (isClosed) {
        console.warn(`[WARN:INSERT_ANSWER] BLOCKING vote: Poll ${input.pollResultId} is already closed`);
        await query("COMMIT");
        return null;
      }
      
      if (pollCurrentVotes >= pollMaxVotes) {
        console.warn(`[WARN:INSERT_ANSWER] BLOCKING vote: Poll ${input.pollResultId} at max votes (${pollCurrentVotes}/${pollMaxVotes})`);
        // Auto-close the poll
        await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [input.pollResultId]);
        await query("COMMIT");
        return null;
      }
      
      // SECOND: For PUBLIC polls: Check if this would exceed the user's vote limit
      if (input.type === "PUBLIC") {
        console.log(`[DEBUG:INSERT_ANSWER] Performing final vote count check for PUBLIC poll`);
        
        // Get the event user's vote amount
        const userQuery = await query(
          `SELECT vote_amount AS voteAmount FROM event_user WHERE id = ? FOR UPDATE`,
          [input.eventUserId]
        );
        
        const maxVotes = Array.isArray(userQuery) && userQuery.length > 0 
          ? parseInt(userQuery[0].voteAmount, 10) || 0 
          : 0;
          
        console.log(`[DEBUG:INSERT_ANSWER] User ${input.eventUserId} max vote amount: ${maxVotes}`);
        
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
          
        console.log(`[DEBUG:INSERT_ANSWER] Current answer count for PUBLIC poll: ${currentCount}/${maxVotes}`);
        
        // Block insertion if it would exceed the limit
        if (currentCount > maxVotes) {
          console.warn(`[WARN:INSERT_ANSWER] BLOCKING PUBLIC vote: User ${input.eventUserId} exceeded limit (${currentCount}/${maxVotes})`);
          await query("COMMIT"); // Still commit to release locks
          return null;
        }
      } else {
        // For SECRET polls: Check vote_cycle/version in poll_user_voted
        console.log(`[DEBUG:INSERT_ANSWER] Performing vote count check for SECRET poll`);
        
        // Get the event user's vote amount
        const userQuery = await query(
          `SELECT vote_amount AS voteAmount FROM event_user WHERE id = ? FOR UPDATE`,
          [input.eventUserId]
        );
        
        const maxVotes = Array.isArray(userQuery) && userQuery.length > 0 
          ? parseInt(userQuery[0].voteAmount, 10) || 0 
          : 0;
          
        console.log(`[DEBUG:INSERT_ANSWER] User ${input.eventUserId} max vote amount: ${maxVotes}`);
        
        // Check vote_cycle for SECRET polls
        const voteCycleQuery = await query(
          `SELECT vote_cycle, version FROM poll_user_voted
           WHERE poll_result_id = ? AND event_user_id = ?
           FOR UPDATE`,
          [input.pollResultId, input.eventUserId]
        );
        
        if (Array.isArray(voteCycleQuery) && voteCycleQuery.length > 0) {
          const voteCycle = parseInt(voteCycleQuery[0].vote_cycle, 10) || 0;
          const version = parseInt(voteCycleQuery[0].version, 10) || 0;
          const currentCount = Math.max(voteCycle, version);
          
          console.log(`[DEBUG:INSERT_ANSWER] Current SECRET vote count: voteCycle=${voteCycle}, version=${version}, using=${currentCount}/${maxVotes}`);
          
          // Block insertion if it would exceed the limit
          if (currentCount > maxVotes) {
            console.warn(`[WARN:INSERT_ANSWER] BLOCKING SECRET vote: User ${input.eventUserId} exceeded limit (${currentCount}/${maxVotes})`);
            await query("COMMIT");
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
          console.error(`[ERROR:INSERT_ANSWER] Could not find poll_user for eventUserId=${input.eventUserId}, pollResultId=${input.pollResultId}`);
          await query("ROLLBACK");
          return null;
        }
        
        console.log(`[DEBUG:INSERT_ANSWER] Inserting PUBLIC poll answer with pollUserId=${pollUserId}`);
        
        // One final check before insertion to make sure we don't exceed poll limits
        const finalCountQuery = await query(
          `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ? FOR UPDATE`,
          [input.pollResultId]
        );
        
        const finalCount = Array.isArray(finalCountQuery) && finalCountQuery.length > 0
          ? parseInt(finalCountQuery[0].total, 10) || 0
          : 0;
          
        if (finalCount >= pollMaxVotes) {
          console.warn(`[WARN:INSERT_ANSWER] FINAL CHECK BLOCKING: Poll already at max votes (${finalCount}/${pollMaxVotes})`);
          await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [input.pollResultId]);
          await query("COMMIT");
          return null;
        }
        
        // Insert with poll_user_id for PUBLIC polls
        await query(
          `INSERT INTO poll_answer SET 
           poll_result_id = ?,
           poll_possible_answer_id = ?,
           answer_content = ?,
           poll_user_id = ?,
           create_datetime = ?`,
          [
            input.pollResultId,
            input.possibleAnswerId,
            input.answerContent,
            pollUserId,
            getCurrentUnixTimeStamp(),
          ]
        );
      } else {
        // Insert without poll_user_id for SECRET polls (for anonymity)
        console.log(`[DEBUG:INSERT_ANSWER] Inserting SECRET poll answer without pollUserId`);
        
        // One final check before insertion to make sure we don't exceed poll limits
        const finalCountQuery = await query(
          `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ? FOR UPDATE`,
          [input.pollResultId]
        );
        
        const finalCount = Array.isArray(finalCountQuery) && finalCountQuery.length > 0
          ? parseInt(finalCountQuery[0].total, 10) || 0
          : 0;
          
        if (finalCount >= pollMaxVotes) {
          console.warn(`[WARN:INSERT_ANSWER] FINAL CHECK BLOCKING: Poll already at max votes (${finalCount}/${pollMaxVotes})`);
          await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [input.pollResultId]);
          await query("COMMIT");
          return null;
        }
        
        await query(
          `INSERT INTO poll_answer SET 
           poll_result_id = ?,
           poll_possible_answer_id = ?,
           answer_content = ?,
           create_datetime = ?`,
          [
            input.pollResultId,
            input.possibleAnswerId,
            input.answerContent,
            getCurrentUnixTimeStamp(),
          ]
        );
      }
      
      // FOURTH: Check if we've hit the limit after insertion and auto-close if needed
      const postInsertCountQuery = await query(
        `SELECT COUNT(*) AS total FROM poll_answer WHERE poll_result_id = ?`,
        [input.pollResultId]
      );
      
      const postInsertCount = Array.isArray(postInsertCountQuery) && postInsertCountQuery.length > 0
        ? parseInt(postInsertCountQuery[0].total, 10) || 0
        : 0;
        
      console.log(`[DEBUG:INSERT_ANSWER] Poll count after insertion: ${postInsertCount}/${pollMaxVotes}`);
      
      // Auto-close poll if we've reached the limit
      if (postInsertCount >= pollMaxVotes) {
        console.log(`[DEBUG:INSERT_ANSWER] Auto-closing poll: reached max votes (${postInsertCount}/${pollMaxVotes})`);
        const updateResult = await query("UPDATE poll_result SET closed = 1 WHERE id = ?", [input.pollResultId]);
        console.log(`[DEBUG:INSERT_ANSWER] Poll close result:`, updateResult);
        
        // Verify the poll was actually closed
        const verifyCloseQuery = await query("SELECT closed FROM poll_result WHERE id = ?", [input.pollResultId]);
        if (Array.isArray(verifyCloseQuery) && verifyCloseQuery.length > 0) {
          console.log(`[DEBUG:INSERT_ANSWER] Poll closed status after update: ${verifyCloseQuery[0].closed}`);
        }
      }
      
      // Commit the transaction
      console.log(`[DEBUG:INSERT_ANSWER] Committing transaction`);
      await query("COMMIT");
      
      return true;
    } catch (txError) {
      // Rollback on any error
      console.error(`[ERROR:INSERT_ANSWER] Transaction error:`, txError);
      await query("ROLLBACK");
      throw txError;
    }
  } catch (error) {
    console.error(`[ERROR:INSERT_ANSWER] Error in insertPollSubmitAnswer:`, error);
    
    // Attempt to rollback in case transaction is still open
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Ignore
    }
    
    return null;
  }
}
