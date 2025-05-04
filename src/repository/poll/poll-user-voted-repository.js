import { insert, query } from "../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_user_voted", input);
}

export async function existInCurrentVote(pollResultId, eventUserId) {
  return await query(
    `
    SELECT id FROM poll_user_voted
    WHERE poll_result_id = ? AND event_user_id = ?
  `,
    [pollResultId, eventUserId],
  );
}

/**
 * Prüft, ob ein Benutzer eine weitere Stimme abgeben darf und erhöht den Stimmzähler wenn erlaubt
 * @param {number} pollResultId - Die ID des Abstimmungsergebnisses
 * @param {number} eventUserId - Die ID des Benutzers
 * @returns {Promise<boolean>} - true wenn eine weitere Stimme abgegeben werden darf, sonst false
 */
export async function allowToCreateNewVote(pollResultId, eventUserId) {
  console.log(`[DEBUG:VOTE_CYCLE] allowToCreateNewVote: Checking for pollResultId=${pollResultId}, eventUserId=${eventUserId}`);
  
  try {
    // Before transaction - check current state for debugging
    const beforeVoteQuery = await query(
      `SELECT vote_cycle AS voteCycle, version, id
       FROM poll_user_voted
       WHERE poll_result_id = ? AND event_user_id = ?`,
      [pollResultId, eventUserId]
    );
    
    if (Array.isArray(beforeVoteQuery) && beforeVoteQuery.length > 0) {
      const beforeVoteCycle = parseInt(beforeVoteQuery[0].voteCycle, 10) || 0;
      const beforeVersion = parseInt(beforeVoteQuery[0].version, 10) || 0;
      console.log(`[DEBUG:VOTE_CYCLE] BEFORE TRANSACTION: Current voteCycle=${beforeVoteCycle}, version=${beforeVersion}, record ID=${beforeVoteQuery[0].id}`);
      
      // Check if voteCycle and version are already out of sync
      if (beforeVoteCycle !== beforeVersion) {
        console.warn(`[WARN:VOTE_CYCLE] BEFORE TRANSACTION: voteCycle and version are already out of sync! voteCycle=${beforeVoteCycle}, version=${beforeVersion}`);
      }
    } else {
      console.log(`[DEBUG:VOTE_CYCLE] BEFORE TRANSACTION: No existing poll_user_voted record found`);
    }
    
    // Wichtig: Transaktionen verwenden, um Race Conditions zu vermeiden
    console.log(`[DEBUG:VOTE_CYCLE] Starting transaction...`);
    await query("START TRANSACTION");
    
    try {
      // Benutzerinformationen mit Sperre abrufen
      console.log(`[DEBUG:VOTE_CYCLE] Fetching user info with lock...`);
      const userQuery = await query(
        `SELECT vote_amount AS voteAmount, verified, allow_to_vote AS allowToVote, online, username 
         FROM event_user 
         WHERE id = ? FOR UPDATE`,
        [eventUserId]
      );
      
      if (!Array.isArray(userQuery) || userQuery.length === 0) {
        console.log(`[INFO] Benutzer ${eventUserId} nicht gefunden.`);
        await query("ROLLBACK");
        return false;
      }
      
      const user = userQuery[0];
      console.log(`[DEBUG:VOTE_CYCLE] User info: voteAmount=${user.voteAmount}, verified=${user.verified}, allowToVote=${user.allowToVote}, online=${user.online}, username=${user.username}`);
      
      if (!user.verified || !user.allowToVote || !user.online) {
        console.log(`[INFO] Benutzer ${eventUserId} ist nicht berechtigt.`);
        await query("ROLLBACK");
        return false;
      }
      
      const maxVotes = parseInt(user.voteAmount, 10) || 0;
      console.log(`[DEBUG:VOTE_CYCLE] Max votes allowed for user: ${maxVotes}`);
      
      // Aktuellen Stimmzähler mit Sperre abrufen
      console.log(`[DEBUG:VOTE_CYCLE] Fetching poll_user_voted record with lock...`);
      const voteQuery = await query(
        `SELECT vote_cycle AS voteCycle, version, id, username, create_datetime
         FROM poll_user_voted
         WHERE poll_result_id = ? AND event_user_id = ?
         FOR UPDATE`,
        [pollResultId, eventUserId]
      );
      
      if (!Array.isArray(voteQuery) || voteQuery.length === 0) {
        console.log(`[INFO] Kein Stimmzähler gefunden für Benutzer ${eventUserId}.`);
        await query("ROLLBACK");
        return false;
      }
      
      const currentVoteCycle = parseInt(voteQuery[0].voteCycle, 10) || 0;
      const currentVersion = parseInt(voteQuery[0].version, 10) || 0;
      console.log(`[DEBUG:VOTE_CYCLE] Current vote record: id=${voteQuery[0].id}, voteCycle=${currentVoteCycle}, version=${currentVersion}, username=${voteQuery[0].username}, create_datetime=${voteQuery[0].create_datetime}`);
      
      // Check if voteCycle and version are out of sync in the locked record
      if (currentVoteCycle !== currentVersion) {
        console.warn(`[WARN:VOTE_CYCLE] voteCycle and version are out of sync in locked record! voteCycle=${currentVoteCycle}, version=${currentVersion}`);
      }
      console.log(`[INFO] Benutzer ${eventUserId} hat bisher ${currentVoteCycle} von ${maxVotes} Stimmen abgegeben.`);
      
      // Stimme inkrementieren, aber nur wenn wir das Maximum nicht überschreiten würden
      if (currentVoteCycle < maxVotes) {
        const newVoteCycle = currentVoteCycle + 1;
        console.log(`[INFO] Erhöhe Stimmzähler für Benutzer ${eventUserId} von ${currentVoteCycle} auf ${newVoteCycle}`);
        
        // Aktualisiere den Stimmzähler mit Transaktion
        // WICHTIG: voteCycle direkt in der Datenbank inkrementieren
        // statt einen berechneten Wert zu setzen
        // KRITISCH: Aktualisiere auch das version-Feld, damit beide Werte synchron sind
        console.log(`[DEBUG:VOTE_CYCLE] Updating poll_user_voted with SQL: UPDATE poll_user_voted SET vote_cycle = vote_cycle + 1, version = version + 1 WHERE poll_result_id = ${pollResultId} AND event_user_id = ${eventUserId} AND vote_cycle < ${maxVotes}`);
        
        const updateResult = await query(
          `UPDATE poll_user_voted
           SET vote_cycle = vote_cycle + 1, version = version + 1
           WHERE poll_result_id = ? AND event_user_id = ? AND vote_cycle < ?`,
          [pollResultId, eventUserId, maxVotes]
        );
        
        console.log(`[DEBUG:VOTE_CYCLE] Update result:`, updateResult);
        
        // Verify the update occurred
        const verifyQuery = await query(
          `SELECT vote_cycle AS voteCycle, version
           FROM poll_user_voted
           WHERE poll_result_id = ? AND event_user_id = ?
           FOR UPDATE`,
          [pollResultId, eventUserId]
        );
        
        const updatedVoteCycle = Array.isArray(verifyQuery) && verifyQuery.length > 0 
          ? parseInt(verifyQuery[0].voteCycle, 10) || 0 
          : 0;
        
        const updatedVersion = Array.isArray(verifyQuery) && verifyQuery.length > 0 
          ? parseInt(verifyQuery[0].version, 10) || 0 
          : 0;
        
        console.log(`[DEBUG:VOTE_CYCLE] After UPDATE, voteCycle=${updatedVoteCycle}, version=${updatedVersion} (both should be ${newVoteCycle})`);
        
        if (updatedVoteCycle !== newVoteCycle || updatedVersion !== newVoteCycle) {
          console.warn(`[WARN:VOTE_CYCLE] Vote fields were not incremented as expected! Expected both at: ${newVoteCycle}, Actual: voteCycle=${updatedVoteCycle}, version=${updatedVersion}`);
        }
        
        // Transaktion abschließen
        console.log(`[DEBUG:VOTE_CYCLE] Committing transaction`);
        await query("COMMIT");
        
        // Post-transaction verification
        const afterVoteQuery = await query(
          `SELECT vote_cycle AS voteCycle, version, id
           FROM poll_user_voted
           WHERE poll_result_id = ? AND event_user_id = ?`,
          [pollResultId, eventUserId]
        );
        
        if (Array.isArray(afterVoteQuery) && afterVoteQuery.length > 0) {
          const afterVoteCycle = parseInt(afterVoteQuery[0].voteCycle, 10) || 0;
          const afterVersion = parseInt(afterVoteQuery[0].version, 10) || 0;
          console.log(`[DEBUG:VOTE_CYCLE] AFTER TRANSACTION: Final voteCycle=${afterVoteCycle}, version=${afterVersion}, record ID=${afterVoteQuery[0].id}`);
          
          // Verify both fields are in sync
          if (afterVoteCycle !== afterVersion) {
            console.warn(`[WARN:VOTE_CYCLE] Final values are not in sync! voteCycle=${afterVoteCycle}, version=${afterVersion}`);
          }
        }
        
        return true;
      } else if (currentVoteCycle === maxVotes) {
        // Genau an der Grenze - letzte Stimme darf gezählt werden, aber keine weitere
        console.log(`[INFO] Benutzer ${eventUserId} hat genau alle ${maxVotes} Stimmen abgegeben`);
        console.log(`[DEBUG:VOTE_CYCLE] User at vote limit, committing transaction without update`);
        await query("COMMIT");
        return true; // Erlauben Sie die letzte Stimme zu zählen
      } else {
        // Schon über dem Maximum - keine weitere Stimme zählen
        console.log(`[WARN] Benutzer ${eventUserId} hat bereits alle ${maxVotes} Stimmen abgegeben!`);
        console.log(`[DEBUG:VOTE_CYCLE] User exceeds vote limit (${currentVoteCycle}/${maxVotes}), committing transaction without update`);
        await query("COMMIT");
        return false;
      }
    } catch (txError) {
      // Bei Fehler: Transaktion zurückrollen
      console.error(`[ERROR] allowToCreateNewVote: Transaktionsfehler:`, txError);
      console.log(`[DEBUG:VOTE_CYCLE] Transaction error, rolling back`);
      await query("ROLLBACK");
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] allowToCreateNewVote: Fehler bei der Prüfung:`, error);
    console.log(`[DEBUG:VOTE_CYCLE] General error, attempting rollback`);
    // Versuche Rollback im Fehlerfall
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Ignorieren
    }
    return false;
  }
}

export async function findByPollResultId(pollResultId) {
  const result = await query(
    "SELECT poll_user_voted.*, event_user.public_name AS publicName FROM poll_user_voted INNER JOIN event_user ON event_user.id = poll_user_voted.event_user_id WHERE poll_user_voted.poll_result_id = ?",
    [pollResultId],
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Erstellt einen neuen poll_user_voted Eintrag unter Berücksichtigung der maximalen Stimmanzahl
 * Verwendet Transaktionen für atomare Operationen
 * @param {number} pollResultId - ID des Abstimmungsergebnisses
 * @param {number} eventUserId - ID des Benutzers
 * @param {number} voteCycle - Anzahl der Stimmen (wird auf max vote_amount begrenzt)
 * @returns {Promise<Object>} - Ergebnis der Datenbankabfrage
 */
export async function createPollUserVoted(
  pollResultId,
  eventUserId,
  voteCycle,
) {
  console.log(`[DEBUG:CREATE_VOTE] createPollUserVoted: Creating for pollResultId=${pollResultId}, eventUserId=${eventUserId}, voteCycle=${voteCycle}`);
  
  try {
    // Check for existing entries before transaction (for debug purposes)
    const preTxCheck = await query(
      `SELECT id, vote_cycle, version, username FROM poll_user_voted 
       WHERE poll_result_id = ? AND event_user_id = ?`,
      [pollResultId, eventUserId]
    );
    
    if (Array.isArray(preTxCheck) && preTxCheck.length > 0) {
      console.log(`[DEBUG:CREATE_VOTE] BEFORE TRANSACTION: Found existing entry - id=${preTxCheck[0].id}, voteCycle=${preTxCheck[0].vote_cycle}, version=${preTxCheck[0].version}, username=${preTxCheck[0].username}`);
      
      // Check if voteCycle and version are already out of sync
      if (parseInt(preTxCheck[0].vote_cycle, 10) !== parseInt(preTxCheck[0].version, 10)) {
        console.warn(`[WARN:CREATE_VOTE] BEFORE TRANSACTION: voteCycle and version are out of sync! voteCycle=${preTxCheck[0].vote_cycle}, version=${preTxCheck[0].version}`);
      }
    } else {
      console.log(`[DEBUG:CREATE_VOTE] BEFORE TRANSACTION: No existing entry found`);
    }
    
    // Transaktion starten, um Race Conditions zu vermeiden
    console.log(`[DEBUG:CREATE_VOTE] Starting transaction...`);
    await query("START TRANSACTION");
    
    try {
      // Prüfen, ob bereits ein Eintrag existiert (mit Sperre)
      console.log(`[DEBUG:CREATE_VOTE] Checking for existing entries with lock...`);
      const existingEntry = await query(
        `SELECT id, vote_cycle, version FROM poll_user_voted 
         WHERE poll_result_id = ? AND event_user_id = ?
         FOR UPDATE`,
        [pollResultId, eventUserId]
      );
      
      // Wenn bereits ein Eintrag existiert, Transaktion abbrechen
      if (Array.isArray(existingEntry) && existingEntry.length > 0) {
        console.log(`[WARN] createPollUserVoted: Eintrag für pollResultId=${pollResultId}, eventUserId=${eventUserId} existiert bereits`);
        console.log(`[DEBUG:CREATE_VOTE] Found existing entry in transaction - id=${existingEntry[0].id}, voteCycle=${existingEntry[0].vote_cycle}, version=${existingEntry[0].version}`);
        
        // Check if voteCycle and version are out of sync in the locked record
        if (parseInt(existingEntry[0].vote_cycle, 10) !== parseInt(existingEntry[0].version, 10)) {
          console.warn(`[WARN:CREATE_VOTE] In transaction: voteCycle and version are out of sync! voteCycle=${existingEntry[0].vote_cycle}, version=${existingEntry[0].version}`);
        }
        
        console.log(`[DEBUG:CREATE_VOTE] Rolling back transaction`);
        await query("ROLLBACK");
        return null;
      }
      
      // Benutzerinformationen mit Sperre abrufen
      console.log(`[DEBUG:CREATE_VOTE] Fetching user info with lock...`);
      const userCheck = await query(
        `SELECT vote_amount AS voteAmount, username, verified, allow_to_vote AS allowToVote 
         FROM event_user 
         WHERE id = ? AND verified = 1 AND allow_to_vote = 1
         FOR UPDATE`,
        [eventUserId]
      );
      
      // Wenn kein Benutzer gefunden oder nicht berechtigt, abbrechen
      if (!Array.isArray(userCheck) || userCheck.length === 0) {
        console.log(`[WARN] createPollUserVoted: Benutzer ${eventUserId} nicht gefunden oder nicht berechtigt`);
        console.log(`[DEBUG:CREATE_VOTE] User not found or not authorized, rolling back transaction`);
        await query("ROLLBACK");
        return null;
      }
      
      console.log(`[DEBUG:CREATE_VOTE] User info: username=${userCheck[0].username}, voteAmount=${userCheck[0].voteAmount}, verified=${userCheck[0].verified}, allowToVote=${userCheck[0].allowToVote}`);
      
      const createDatetime = getCurrentUnixTimeStamp();
      const username = userCheck[0].username;
      
      // Stelle sicher, dass voteAmount ein numerischer Wert ist
      const maxVotes = parseInt(userCheck[0].voteAmount, 10) || 0;
      
      // Parsen und validieren von voteCycle
      const parsedVoteCycle = parseInt(voteCycle, 10) || 1;
      
      // Sicherstellen, dass voteCycle nicht höher als erlaubt ist und mindestens 1
      const finalVoteCycle = Math.max(1, Math.min(parsedVoteCycle, maxVotes));
      
      console.log(`[DEBUG:CREATE_VOTE] Vote cycle calculation: maxVotes=${maxVotes}, requestedVoteCycle=${parsedVoteCycle}, finalVoteCycle=${finalVoteCycle}`);
      
      if (finalVoteCycle !== parsedVoteCycle) {
        console.log(`[WARN] createPollUserVoted: voteCycle auf ${finalVoteCycle} (max) statt ${parsedVoteCycle} begrenzt`);
      }
      
      // Direktes INSERT in einer Transaktion
      // KRITISCH: Stelle sicher, dass version und voteCycle synchron sind
      console.log(`[DEBUG:CREATE_VOTE] Executing INSERT with values: eventUserId=${eventUserId}, username=${username}, pollResultId=${pollResultId}, finalVoteCycle=${finalVoteCycle}, createDatetime=${createDatetime}`);
      
      const insertQuery = `INSERT INTO poll_user_voted 
         (event_user_id, username, poll_result_id, vote_cycle, create_datetime, version)
         VALUES (?, ?, ?, ?, ?, ?)`;
      
      console.log(`[DEBUG:CREATE_VOTE] SQL: ${insertQuery}`);
      
      const result = await query(
        insertQuery,
        [eventUserId, username, pollResultId, finalVoteCycle, createDatetime, finalVoteCycle]  // VERSION equals VOTE_CYCLE for new rows
      );
      
      console.log(`[DEBUG:CREATE_VOTE] INSERT result:`, result);
      console.log(`[INFO] createPollUserVoted: Eintrag erstellt mit voteCycle=${finalVoteCycle}`);
      
      // Verify that the insert worked
      const verifyInsert = await query(
        `SELECT id, vote_cycle, version, username FROM poll_user_voted 
         WHERE poll_result_id = ? AND event_user_id = ?
         FOR UPDATE`,
        [pollResultId, eventUserId]
      );
      
      if (Array.isArray(verifyInsert) && verifyInsert.length > 0) {
        console.log(`[DEBUG:CREATE_VOTE] Verified INSERT: id=${verifyInsert[0].id}, voteCycle=${verifyInsert[0].vote_cycle}, version=${verifyInsert[0].version}, username=${verifyInsert[0].username}`);
        
        // Verify voteCycle and version are in sync
        if (parseInt(verifyInsert[0].vote_cycle, 10) !== parseInt(verifyInsert[0].version, 10)) {
          console.warn(`[WARN:CREATE_VOTE] voteCycle and version are not in sync after insert! voteCycle=${verifyInsert[0].vote_cycle}, version=${verifyInsert[0].version}`);
        }
      } else {
        console.warn(`[WARN:CREATE_VOTE] Could not verify INSERT - entry not found immediately after insert!`);
      }
      
      // Transaktion abschließen
      console.log(`[DEBUG:CREATE_VOTE] Committing transaction`);
      await query("COMMIT");
      
      // After transaction verification
      const postTxCheck = await query(
        `SELECT id, vote_cycle, version, username FROM poll_user_voted 
         WHERE poll_result_id = ? AND event_user_id = ?`,
        [pollResultId, eventUserId]
      );
      
      if (Array.isArray(postTxCheck) && postTxCheck.length > 0) {
        console.log(`[DEBUG:CREATE_VOTE] AFTER TRANSACTION: Confirmed entry - id=${postTxCheck[0].id}, voteCycle=${postTxCheck[0].vote_cycle}, version=${postTxCheck[0].version}, username=${postTxCheck[0].username}`);
        
        // Final verification that voteCycle and version are in sync
        if (parseInt(postTxCheck[0].vote_cycle, 10) !== parseInt(postTxCheck[0].version, 10)) {
          console.warn(`[WARN:CREATE_VOTE] AFTER TRANSACTION: voteCycle and version are not in sync! voteCycle=${postTxCheck[0].vote_cycle}, version=${postTxCheck[0].version}`);
        }
      } else {
        console.warn(`[WARN:CREATE_VOTE] AFTER TRANSACTION: Entry not found despite successful commit!`);
      }
      
      return result;
    } catch (txError) {
      // Bei Fehler: Transaktion zurückrollen
      console.error(`[ERROR] createPollUserVoted: Transaktionsfehler:`, txError);
      console.log(`[DEBUG:CREATE_VOTE] Transaction error, rolling back`, txError);
      await query("ROLLBACK");
      throw txError;
    }
  } catch (error) {
    console.error(`[ERROR] createPollUserVoted: Fehler beim Erstellen:`, error);
    console.log(`[DEBUG:CREATE_VOTE] General error in createPollUserVoted`, error);
    
    // Versuche Rollback im Fehlerfall
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Ignorieren
    }
    
    return null;
  }
}

/**
 * Gets the current vote cycle for a user in a specific poll result
 * @param {number} pollResultId 
 * @param {number} eventUserId 
 * @returns {Promise<{voteCycle: number}|null>}
 */
export async function getUserVoteCycle(pollResultId, eventUserId) {
  console.log(`[DEBUG] getUserVoteCycle: Suche Vote-Cycle für pollResultId=${pollResultId}, eventUserId=${eventUserId}`);
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
    
    console.log(`[DEBUG] getUserVoteCycle: Ergebnis für pollResultId=${pollResultId}, eventUserId=${eventUserId}:`, result);
    
    if (Array.isArray(result) && result.length > 0) {
      return result[0];
    } else {
      console.log(`[DEBUG] getUserVoteCycle: Kein Eintrag für pollResultId=${pollResultId}, eventUserId=${eventUserId} gefunden`);
      return null;
    }
  } catch (error) {
    console.error(`[ERROR] getUserVoteCycle: Fehler bei Abfrage für pollResultId=${pollResultId}, eventUserId=${eventUserId}:`, error);
    return null;
  }
}

/**
 * Sucht den höchsten Vote-Cycle für einen Benutzer in einer bestimmten Poll (über alle poll_results hinweg)
 * @param {number} pollId 
 * @param {number} eventUserId 
 * @returns {Promise<{voteCycle: number}|null>}
 */
export async function getHighestVoteCycleForPoll(pollId, eventUserId) {
  console.log(`[DEBUG] getHighestVoteCycleForPoll: Suche höchsten Vote-Cycle für pollId=${pollId}, eventUserId=${eventUserId}`);
  try {
    const result = await query(
      `
      SELECT MAX(puv.vote_cycle) as voteCycle
      FROM poll_user_voted puv
      JOIN poll_result pr ON puv.poll_result_id = pr.id
      WHERE pr.poll_id = ? AND puv.event_user_id = ?
      `,
      [pollId, eventUserId]
    );
    
    console.log(`[DEBUG] getHighestVoteCycleForPoll: Ergebnis für pollId=${pollId}, eventUserId=${eventUserId}:`, result);
    
    if (Array.isArray(result) && result.length > 0 && result[0].voteCycle) {
      return { voteCycle: parseInt(result[0].voteCycle, 10) || 0 };
    } else {
      console.log(`[DEBUG] getHighestVoteCycleForPoll: Kein Eintrag für pollId=${pollId}, eventUserId=${eventUserId} gefunden`);
      return null;
    }
  } catch (error) {
    console.error(`[ERROR] getHighestVoteCycleForPoll: Fehler bei Abfrage für pollId=${pollId}, eventUserId=${eventUserId}:`, error);
    return null;
  }
}

/**
 * Zählt die TATSÄCHLICHE Gesamtzahl der abgegebenen Antworten für einen Benutzer in einer Poll
 * Diese Funktion zählt die tatsächlichen poll_answer Einträge, nicht nur den vote_cycle
 * @param {number} pollResultId 
 * @param {number} eventUserId 
 * @returns {Promise<number>}
 */
export async function countActualAnswersForUser(pollResultId, eventUserId) {
  console.log(`[DEBUG] countActualAnswersForUser: Zähle tatsächliche Antworten für pollResultId=${pollResultId}, eventUserId=${eventUserId}`);
  try {
    const result = await query(
      `
      SELECT COUNT(*) as answerCount
      FROM poll_answer pa
      JOIN poll_user pu ON pa.poll_user_id = pu.id
      WHERE pa.poll_result_id = ? AND pu.event_user_id = ?
      `,
      [pollResultId, eventUserId]
    );
    
    console.log(`[DEBUG] countActualAnswersForUser: Ergebnis:`, result);
    
    if (Array.isArray(result) && result.length > 0) {
      const count = parseInt(result[0].answerCount, 10) || 0;
      console.log(`[INFO] Benutzer ${eventUserId} hat tatsächlich ${count} Antworten in dieser Abstimmung abgegeben`);
      return count;
    }
    
    return 0;
  } catch (error) {
    console.error(`[ERROR] countActualAnswersForUser: Fehler bei der Zählung:`, error);
    return 0;
  }
}

/**
 * Berechnet den aktuellen "realen" VoteCycle basierend auf der Anzahl der Antworten
 * und der Anzahl der möglichen Antworten pro Abstimmung
 * @param {number} pollResultId 
 * @param {number} eventUserId 
 * @param {number} answersPerVote - Anzahl der möglichen Antworten pro Abstimmung
 * @returns {Promise<number>}
 */
export async function calculateRealVoteCycle(pollResultId, eventUserId, answersPerVote = 1) {
  try {
    // Zähle die tatsächlichen Antworten
    const answerCount = await countActualAnswersForUser(pollResultId, eventUserId);
    
    // Wenn keine Antworten vorhanden sind, gibt es keinen Vote-Cycle
    if (answerCount === 0) {
      return 0;
    }
    
    // Berechne den Vote-Cycle basierend auf der Anzahl der Antworten
    // Bei mehreren Antworten pro Abstimmung (z.B. Multiple-Choice) teilen wir durch die Anzahl der Antworten pro Stimme
    const effectiveVoteCycle = Math.ceil(answerCount / Math.max(1, answersPerVote));
    
    console.log(`[INFO] Benutzer ${eventUserId} hat einen effektiven Vote-Cycle von ${effectiveVoteCycle} (${answerCount} Antworten mit ${answersPerVote} Antworten pro Stimme)`);
    
    return effectiveVoteCycle;
  } catch (error) {
    console.error(`[ERROR] calculateRealVoteCycle: Fehler bei der Berechnung:`, error);
    return 0;
  }
}