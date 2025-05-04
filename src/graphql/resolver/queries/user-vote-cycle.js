import { getUserVoteCycle, getHighestVoteCycleForPoll } from "../../../repository/poll/poll-user-voted-repository";
import { findOneByPollId } from "../../../repository/poll/poll-result-repository";
import { findOneById } from "../../../repository/event-user-repository";
import { query } from "../../../lib/database";

export default {
  userVoteCycle: async function(_, args) {
  try {
    console.log("[DEBUG] userVoteCycle Input: ", args);
    
    if (!args) {
      console.error("userVoteCycle: Keine Parameter übergeben!");
      return { voteCycle: 0, maxVotes: 0 };
    }
    
    const { eventUserId, pollId } = args;

    // Parameter validieren
    if (!eventUserId || !pollId) {
      console.error("Fehlende Parameter:", { eventUserId, pollId });
      return { voteCycle: 0, maxVotes: 0 };
    }

    // Zuerst den aktuellen poll_result für diese Poll-ID abrufen
    console.log(`[DEBUG] userVoteCycle: Suche Poll-Result für Poll-ID ${pollId}`);
    const pollResult = await findOneByPollId(pollId);
    console.log(`[DEBUG] userVoteCycle: Poll-Result für Poll-ID ${pollId}:`, pollResult);
    
    if (!pollResult) {
      console.log(`[DEBUG] userVoteCycle: Kein Poll-Result für Poll-ID ${pollId} gefunden`);
      return { voteCycle: 0, maxVotes: 0 };
    }

    // Dann Infos zum Event-User abrufen (besonders voteAmount)
    console.log(`[DEBUG] userVoteCycle: Suche Event-User mit ID ${eventUserId}`);
    const eventUser = await findOneById(eventUserId);
    console.log(`[DEBUG] userVoteCycle: Event-User mit ID ${eventUserId}:`, eventUser);
    
    if (!eventUser) {
      console.log(`[DEBUG] userVoteCycle: Kein Event-User mit ID ${eventUserId} gefunden`);
      return { voteCycle: 0, maxVotes: 0 };
    }

    // DIREKTE METHODE: Suchen nach dem höchsten Vote-Cycle für diesen Benutzer in dieser Poll
    // Diese Methode umgeht das Problem mit der pollResult-Tabelle und sucht über alle pollResults für diese Poll
    console.log(`[DEBUG] userVoteCycle: Suche höchsten Vote-Cycle direkt für pollId=${pollId}, eventUserId=${eventUserId}`);
    const directUserVote = await getHighestVoteCycleForPoll(pollId, eventUserId);
    console.log(`[DEBUG] userVoteCycle: Direkter UserVote für pollId=${pollId}, eventUserId=${eventUserId}:`, directUserVote);
    
    // Fallback: Wenn die direkte Methode keine Ergebnisse liefert, versuchen wir die klassische Methode
    let userVote = null;
    if (pollResult) {
      console.log(`[DEBUG] userVoteCycle: Fallback - Suche Vote-Cycle für pollResultId=${pollResult.id}, eventUserId=${eventUserId}`);
      userVote = await getUserVoteCycle(pollResult.id, eventUserId);
      console.log(`[DEBUG] userVoteCycle: Fallback - UserVote für pollResultId=${pollResult.id}, eventUserId=${eventUserId}:`, userVote);
    }
    
    // ZUSÄTZLICHE PRÜFUNG: Prüfe, ob version und vote_cycle synchron sind
    // Bei Diskrepanz nutze den höheren Wert, um sicherzustellen, dass der Benutzer keine zusätzlichen Stimmen erhält
    if (pollResult) {
      const versionQuery = await query(
        `SELECT vote_cycle, version FROM poll_user_voted 
         WHERE poll_result_id = ? AND event_user_id = ?`,
        [pollResult.id, eventUserId]
      );
      
      if (Array.isArray(versionQuery) && versionQuery.length > 0) {
        const dbVoteCycle = parseInt(versionQuery[0].vote_cycle, 10) || 0;
        const dbVersion = parseInt(versionQuery[0].version, 10) || 0;
        
        if (dbVoteCycle !== dbVersion) {
          console.warn(`[WARN] userVoteCycle: Diskrepanz zwischen voteCycle (${dbVoteCycle}) und version (${dbVersion}) gefunden!`);
          // Nutze den höheren Wert, um sicherzustellen, dass der Benutzer nicht mehr Stimmen abgeben kann, als erlaubt
          const maxValue = Math.max(dbVoteCycle, dbVersion);
          console.log(`[DEBUG] userVoteCycle: Verwende den höheren Wert (${maxValue}) als tatsächlichen voteCycle`);
          
          if (userVote) {
            userVote.voteCycle = maxValue;
          }
        }
      }
    }
    
    // Vorrang hat die direkte Abfrage über alle poll_results
    const voteCycle = directUserVote?.voteCycle || userVote?.voteCycle || 0;
    
    const response = {
      voteCycle: voteCycle,
      maxVotes: eventUser.voteAmount || 0
    };
    
    console.log(`[DEBUG] userVoteCycle: Rückgabewert:`, response);
    return response;
  } catch (error) {
    console.error("Fehler beim Abrufen des Vote-Cycle:", error, "für Parameter:", args);
    return { voteCycle: 0, maxVotes: 0 };
  }
  }
}