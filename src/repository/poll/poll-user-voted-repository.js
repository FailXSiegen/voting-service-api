import { insert, query } from "../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_user_voted", input);
}

/**
 * Prüft, ob ein Benutzer bereits an einer Abstimmung teilgenommen hat
 * @param {number} pollResultId - Die ID des Abstimmungsergebnisses
 * @param {number} eventUserId - Die ID des Benutzers
 * @returns {Promise<boolean>} - true wenn der Benutzer bereits abgestimmt hat, sonst false
 */
export async function existInCurrentVote(pollResultId, eventUserId) {
  const result = await query(
    `
    SELECT EXISTS(
      SELECT 1 FROM poll_user_voted 
      WHERE poll_result_id = ? AND event_user_id = ?
    ) AS voted
    `,
    [pollResultId, eventUserId],
  );

  // Bei Datenbankfehler (result ist null) geben wir false zurück
  if (!result || result.length === 0) {
    return false;
  }

  // MySQL gibt bei EXISTS() einen Wert von 0 oder 1 zurück
  return result[0].voted === 1;
}

/**
 * Prüft, ob ein Benutzer eine weitere Stimme abgeben darf und erhöht den Stimmzähler wenn erlaubt
 * @param {number} pollResultId - Die ID des Abstimmungsergebnisses
 * @param {number} eventUserId - Die ID des Benutzers
 * @returns {Promise<boolean>} - true wenn eine weitere Stimme abgegeben werden darf, sonst false
 */
export async function allowToCreateNewVote(pollResultId, eventUserId) {

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

      // Check if voteCycle and version are already out of sync
      if (beforeVoteCycle !== beforeVersion) {
        console.warn(`[WARN:VOTE_CYCLE] BEFORE TRANSACTION: voteCycle and version are already out of sync! voteCycle=${beforeVoteCycle}, version=${beforeVersion}`);
      }
    }

    await query("START TRANSACTION");

    try {

      const userQuery = await query(
        `SELECT vote_amount AS voteAmount, verified, allow_to_vote AS allowToVote, online, username 
         FROM event_user 
         WHERE id = ? FOR UPDATE`,
        [eventUserId]
      );

      if (!Array.isArray(userQuery) || userQuery.length === 0) {
        await query("ROLLBACK");
        return false;
      }

      const user = userQuery[0];


      if (!user.verified || !user.allowToVote || !user.online) {
        await query("ROLLBACK");
        return false;
      }

      const maxVotes = parseInt(user.voteAmount, 10) || 0;

      const voteQuery = await query(
        `SELECT vote_cycle AS voteCycle, version, id, username, create_datetime
         FROM poll_user_voted
         WHERE poll_result_id = ? AND event_user_id = ?
         FOR UPDATE`,
        [pollResultId, eventUserId]
      );

      if (!Array.isArray(voteQuery) || voteQuery.length === 0) {
        await query("ROLLBACK");
        return false;
      }

      const currentVoteCycle = parseInt(voteQuery[0].voteCycle, 10) || 0;
      const currentVersion = parseInt(voteQuery[0].version, 10) || 0;

      // Check if voteCycle and version are out of sync in the locked record
      if (currentVoteCycle !== currentVersion) {
        console.warn(`[WARN:VOTE_CYCLE] voteCycle and version are out of sync in locked record! voteCycle=${currentVoteCycle}, version=${currentVersion}`);
      }

      // WICHTIG: Wir prüfen nur, ob der Benutzer noch Stimmen übrig hat, erhöhen aber noch NICHT
      // den Vote-Cycle! Dies passiert erst, nachdem die eigentliche Stimme erfolgreich abgegeben wurde.
      // HINWEIS: Da wir jetzt mit vote_cycle=0 starten, bedeutet vote_cycle = 0, dass noch keine Stimme abgegeben wurde!
      if (currentVoteCycle < maxVotes) {
        await query("COMMIT");
        return true;
      } else {
        await query("COMMIT");
        console.warn(`[WARN:VOTE_CYCLE] Benutzer ${eventUserId} hat Stimmenlimit erreicht: voteCycle=${currentVoteCycle}, maxVotes=${maxVotes}`);
        return false;
      }
    } catch (txError) {
      // Bei Fehler: Transaktion zurückrollen
      console.error(`[ERROR] allowToCreateNewVote: Transaktionsfehler:`, txError);
      await query("ROLLBACK");
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] allowToCreateNewVote: Fehler bei der Prüfung:`, error);
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

  try {
    // Check for existing entries before transaction (for debug purposes)
    const preTxCheck = await query(
      `SELECT id, vote_cycle, version, username FROM poll_user_voted 
       WHERE poll_result_id = ? AND event_user_id = ?`,
      [pollResultId, eventUserId]
    );

    if (Array.isArray(preTxCheck) && preTxCheck.length > 0) {

      // Check if voteCycle and version are already out of sync
      if (parseInt(preTxCheck[0].vote_cycle, 10) !== parseInt(preTxCheck[0].version, 10)) {
        console.warn(`[WARN:CREATE_VOTE] BEFORE TRANSACTION: voteCycle and version are out of sync! voteCycle=${preTxCheck[0].vote_cycle}, version=${preTxCheck[0].version}`);
      }
    }

    await query("START TRANSACTION");

    try {
      const existingEntry = await query(
        `SELECT id, vote_cycle, version FROM poll_user_voted 
         WHERE poll_result_id = ? AND event_user_id = ?
         FOR UPDATE`,
        [pollResultId, eventUserId]
      );

      // Wenn bereits ein Eintrag existiert, Transaktion abbrechen
      if (Array.isArray(existingEntry) && existingEntry.length > 0) {
        // Check if voteCycle and version are out of sync in the locked record
        if (parseInt(existingEntry[0].vote_cycle, 10) !== parseInt(existingEntry[0].version, 10)) {
          console.warn(`[WARN:CREATE_VOTE] In transaction: voteCycle and version are out of sync! voteCycle=${existingEntry[0].vote_cycle}, version=${existingEntry[0].version}`);
        }

        await query("ROLLBACK");
        return null;
      }

      const userCheck = await query(
        `SELECT vote_amount AS voteAmount, username, verified, allow_to_vote AS allowToVote 
         FROM event_user 
         WHERE id = ? AND verified = 1 AND allow_to_vote = 1
         FOR UPDATE`,
        [eventUserId]
      );

      // Wenn kein Benutzer gefunden oder nicht berechtigt, abbrechen
      if (!Array.isArray(userCheck) || userCheck.length === 0) {
        console.warn(`[WARN] createPollUserVoted: Benutzer ${eventUserId} nicht gefunden oder nicht berechtigt`);
        await query("ROLLBACK");
        return null;
      }

      const createDatetime = getCurrentUnixTimeStamp();
      const username = userCheck[0].username;

      // Stelle sicher, dass voteAmount ein numerischer Wert ist
      const maxVotes = parseInt(userCheck[0].voteAmount, 10) || 0;

      // Parsen und validieren von voteCycle
      // WICHTIG: Wir setzen den initialen vote_cycle auf 0 statt 1,
      // damit der Zyklus erst nach Abgabe der ersten Stimme erhöht wird
      const parsedVoteCycle = parseInt(voteCycle, 10) || 0;

      // Sicherstellen, dass voteCycle nicht höher als erlaubt ist und 0 für den initalen Zustand
      const finalVoteCycle = Math.min(parsedVoteCycle, maxVotes);

      if (finalVoteCycle !== parsedVoteCycle) {
        console.warn(`[WARN] createPollUserVoted: voteCycle auf ${finalVoteCycle} (max) statt ${parsedVoteCycle} begrenzt`);
      }


      const insertQuery = `INSERT INTO poll_user_voted 
         (event_user_id, username, poll_result_id, vote_cycle, create_datetime, version)
         VALUES (?, ?, ?, ?, ?, ?)`;

      const result = await query(
        insertQuery,
        [eventUserId, username, pollResultId, finalVoteCycle, createDatetime, finalVoteCycle]  // VERSION equals VOTE_CYCLE for new rows
      );
      // OPTIMIERUNG: Entfernung der Verifikationsabfrage mit FOR UPDATE
      // Diese Prüfung ist redundant und verursacht nur zusätzliche Sperren
      // Wenn das INSERT fehlschlägt, würde das über den Fehlerhandler erkannt werden
      
      // Log für Debug-Zwecke
      console.log(`[INFO:CREATE_VOTE] New poll_user_voted entry created with vote_cycle=${finalVoteCycle}`);
      await query("COMMIT");

      // OPTIMIERUNG: Entfernung der Post-Transaktions-Verifikation
      // Diese Prüfung ist nicht notwendig und verlangsamt nur die Verarbeitung
      // Wenn die Transaktion erfolgreich committet wurde, können wir davon ausgehen, dass die Daten korrekt sind

      return result;
    } catch (txError) {
      // Bei Fehler: Transaktion zurückrollen
      console.error(`[ERROR] createPollUserVoted: Transaktionsfehler:`, txError);
      await query("ROLLBACK");
      throw txError;
    }
  } catch (error) {
    console.error(`[ERROR] createPollUserVoted: Fehler beim Erstellen:`, error);

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

    if (Array.isArray(result) && result.length > 0) {
      return result[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error(`[ERROR] getUserVoteCycle: Fehler bei Abfrage für pollResultId=${pollResultId}, eventUserId=${eventUserId}:`, error);
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


    if (Array.isArray(result) && result.length > 0) {
      const count = parseInt(result[0].answerCount, 10) || 0;
      return count;
    }

    return 0;
  } catch (error) {
    console.error(`[ERROR] countActualAnswersForUser: Fehler bei der Zählung:`, error);
    return 0;
  }
}

/**
 * Erhöht den vote_cycle eines Benutzers NACHDEM die Stimme erfolgreich abgegeben wurde
 * @param {number} pollResultId - Die ID des Abstimmungsergebnisses
 * @param {number} eventUserId - Die ID des Benutzers
 * @param {number} incrementBy - Optional: Anzahl der Schritte, um die erhöht werden soll (für Bulk-Voting)
 * @returns {Promise<boolean>} - true bei Erfolg, false bei Fehler
 */
export async function incrementVoteCycleAfterVote(pollResultId, eventUserId, incrementBy = 1) {
  try {
    await query("START TRANSACTION");

    try {
      const userQuery = await query(
        `SELECT vote_amount AS voteAmount
         FROM event_user 
         WHERE id = ? FOR UPDATE`,
        [eventUserId]
      );

      if (!Array.isArray(userQuery) || userQuery.length === 0) {
        await query("ROLLBACK");
        return false;
      }

      const maxVotes = parseInt(userQuery[0].voteAmount, 10) || 0;

      const voteQuery = await query(
        `SELECT vote_cycle AS voteCycle, version, id
         FROM poll_user_voted
         WHERE poll_result_id = ? AND event_user_id = ?
         FOR UPDATE`,
        [pollResultId, eventUserId]
      );

      if (!Array.isArray(voteQuery) || voteQuery.length === 0) {
        await query("ROLLBACK");
        return false;
      }

      const currentVoteCycle = parseInt(voteQuery[0].voteCycle, 10) || 0;
      const currentVersion = parseInt(voteQuery[0].version, 10) || 0;

      // Check if voteCycle and version are out of sync in the locked record
      if (currentVoteCycle !== currentVersion) {
        console.warn(`[WARN:INC_VOTE_CYCLE] voteCycle and version are out of sync in locked record! voteCycle=${currentVoteCycle}, version=${currentVersion}`);
      }

      // Prüfen, ob wir durch die Erhöhung das Maximum überschreiten würden
      if (currentVoteCycle + incrementBy <= maxVotes) {
        try {
          // WICHTIGER FIX: Entferne die Bedingung für vote_cycle + ? <= ?, da diese zu restriktiv sein könnte
          // Wir haben bereits geprüft, ob wir das Maximum überschreiten würden
          const updateResult = await query(
            `UPDATE poll_user_voted
             SET vote_cycle = vote_cycle + ?, version = version + ?
             WHERE poll_result_id = ? AND event_user_id = ?`,
            [incrementBy, incrementBy, pollResultId, eventUserId]
          );


          // Direkt die erwarteten Werte berechnen
          const newVoteCycle = currentVoteCycle + incrementBy;

          // OPTIMIERUNG: Entfernung der Verifikationsabfrage mit FOR UPDATE
          // Diese Prüfung ist redundant und verursacht nur zusätzliche Sperren
          // Wenn das UPDATE fehlschlägt, würde das über den Fehlerhandler erkannt werden
          
          // Log für Debug-Zwecke
          console.log(`[INFO:INC_VOTE_CYCLE] Vote cycle increment request executed. Expected new value: ${newVoteCycle}`);
        } catch (updateError) {
          console.error(`[ERROR:INC_VOTE_CYCLE] Fehler beim Update: ${updateError.message}`);
          throw updateError; // Re-throw error to be caught by the outer try/catch
        }

      } else if (currentVoteCycle < maxVotes) {
        // Wir können nur bis zum Maximum erhöhen
        const remainingVotes = maxVotes - currentVoteCycle;
        console.warn(`[WARN:INC_VOTE_CYCLE] Nur ${remainingVotes} von ${incrementBy} angeforderten Stimmen können erhöht werden (Maximum erreicht)`);

        try {
          const updateResult = await query(
            `UPDATE poll_user_voted
             SET vote_cycle = ?, version = ?
             WHERE poll_result_id = ? AND event_user_id = ?`,
            [maxVotes, maxVotes, pollResultId, eventUserId]
          );

          // OPTIMIERUNG: Entfernung der Verifikationsabfrage mit FOR UPDATE
          // Diese Prüfung ist redundant und verursacht nur zusätzliche Sperren
          // Wenn das UPDATE fehlschlägt, würde das über den Fehlerhandler erkannt werden
          
          // Log für Debug-Zwecke
          console.log(`[INFO:INC_VOTE_CYCLE] Vote cycle set to maximum request executed. Expected new value: ${maxVotes}`);
        } catch (updateError) {
          console.error(`[ERROR:INC_VOTE_CYCLE] Fehler beim Update auf Maximum: ${updateError.message}`);
          throw updateError; // Re-throw error to be caught by the outer try/catch
        }
      } else {
        // Benutzer hat bereits die maximale Anzahl von Stimmen abgegeben
        console.warn(`[WARN:INC_VOTE_CYCLE] Benutzer ${eventUserId} hat bereits alle ${maxVotes} Stimmen abgegeben. Keine weitere Erhöhung möglich.`);
      }

      await query("COMMIT");
      return true;

    } catch (txError) {
      // Bei Fehler: Transaktion zurückrollen
      console.error(`[ERROR] incrementVoteCycleAfterVote: Transaktionsfehler:`, txError);
      await query("ROLLBACK");
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] incrementVoteCycleAfterVote: Fehler bei der Inkrementierung:`, error);
    // Versuche Rollback im Fehlerfall
    try {
      await query("ROLLBACK");
    } catch (e) {
      // Ignorieren
    }
    return false;
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


    return effectiveVoteCycle;
  } catch (error) {
    console.error(`[ERROR] calculateRealVoteCycle: Fehler bei der Berechnung:`, error);
    return 0;
  }
}