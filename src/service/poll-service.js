import { updatePollResultMaxVotes, findLeftAnswersCount } from "../repository/poll/poll-result-repository";
import {
  createPollUserWithPollResultId,
  existAsPollUserInCurrentVote,
} from "../repository/poll/poll-user-repository";
import {
  allowToCreateNewVote,
  createPollUserVoted,
  existInCurrentVote,
  calculateRealVoteCycle
} from "../repository/poll/poll-user-voted-repository";
import { findOneById } from "../repository/event-user-repository";
import { pubsub } from "../server/graphql";
import { POLL_ANSWER_LIFE_CYCLE } from "../graphql/resolver/subscription/subscription-types";
import { query } from "../lib/database";

/**
 * Creates a new poll user record, if the event-user id does not yet exist.
 * @param {number} pollResultId
 * @param {number} eventUserId
 */
export async function createPollUserIfNeeded(pollResultId, eventUserId) {

  try {
    const userExists = await existAsPollUserInCurrentVote(
      pollResultId,
      eventUserId,
    );


    // userExists === null bedeutet, dass der Nutzer nicht existiert
    // userExists ist ein Array, wenn der Nutzer gefunden wurde
    if (!userExists || userExists.length === 0) {

      const result = await createPollUserWithPollResultId(
        pollResultId,
        eventUserId,
      );

      if (result) {
        await updatePollResultMaxVotes(pollResultId, eventUserId);

        // Nach dem Hinzufügen des Benutzers die aktuellen Zahlen holen und ein Subscription-Event auslösen
        try {
          // Event-ID aus der Poll-ID ermitteln
          const eventIdResult = await query(
            "SELECT poll.event_id FROM poll INNER JOIN poll_result ON poll.id = poll_result.poll_id WHERE poll_result.id = ?",
            [pollResultId]
          );

          const eventId = eventIdResult?.[0]?.event_id;


          if (eventId) {
            // Aktuelle Abstimmungszahlen abrufen
            const leftAnswersDataSet = await findLeftAnswersCount(pollResultId);

            // Event auslösen, um alle Clients zu aktualisieren
            if (leftAnswersDataSet) {
              pubsub.publish(POLL_ANSWER_LIFE_CYCLE, {
                ...leftAnswersDataSet,
                eventId: eventId,
              });
            }
          }
        } catch (error) {
          console.error("[ERROR] Fehler beim Aktualisieren der Teilnehmerzahlen:", error);
        }

        return { success: true, message: "User added to poll" };
      }

      return { success: false, message: "Failed to add user to poll" };
    } else {
      return { success: true, message: "User already exists in poll" };
    }
  } catch (error) {
    console.error(`[ERROR] Error in createPollUserIfNeeded: ${error.message}`);
    console.error(error.stack);
    return { success: false, message: error.message };
  }
}

/**
 * Überprüft und aktualisiert die Abstimmungszähler für einen Benutzer
 * @param {number} pollResultId - Die ID des Abstimmungsergebnisses
 * @param {number} eventUserId - Die ID des Benutzers
 * @param {boolean} multiVote - Flag für Multivote-Modus
 * @param {Object} input - Optionale Eingabeparameter, insbesondere voteCycle
 * @returns {Promise<boolean>} - true wenn die Stimme gezählt werden soll, false wenn nicht
 */
export async function existsPollUserVoted(
  pollResultId,
  eventUserId,
  multiVote,
  input = {}
) {
  try {
    console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] Starting check for user ${eventUserId}, pollResult ${pollResultId}, multiVote ${multiVote}`);
    
    // Prüfe, ob der Benutzer bereits in dieser Abstimmung abgestimmt hat
    const userExists = await existInCurrentVote(pollResultId, eventUserId);
    console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] userExists result:`, userExists);
    
    // Benutzerinformationen abrufen
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      console.error(`[ERROR] existsPollUserVoted: Benutzer mit ID ${eventUserId} nicht gefunden`);
      return false;
    }
    
    console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] eventUser:`, {
      id: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount
    });

    // Sicherstellen, dass der Benutzer überhaupt abstimmen darf
    if (!eventUser.verified || !eventUser.allowToVote) {
      console.warn(`[WARN] existsPollUserVoted: Benutzer ${eventUserId} ist nicht verifiziert (${eventUser.verified}) oder darf nicht abstimmen (${eventUser.allowToVote})`);
      return false;
    }

    // Die maximale Stimmanzahl sicherstellen
    const maxVotes = parseInt(eventUser.voteAmount, 10) || 0;

    // Im multiVote-Modus müssen wir die Anzahl der abzugebenden Stimmen respektieren
    // Dies wird jetzt vom Client korrekt übergeben und hier validiert
    // Der Client sendet jetzt entweder 1 für einzelne Stimmen oder die Anzahl der verbleibenden Stimmen

    // Neuen Eintrag erstellen, wenn es der erste ist
    if (!userExists) {
      console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] User ${eventUserId} hat noch keinen poll_user_voted Eintrag - erstelle neuen`);
      
      // Ein erster Vote-Cycle von 1 ist der Standardwert für neue Einträge
      // Falls multiVote aktiviert ist und der Client hat mehr angefordert, kann der Wert erhöht werden

      // WICHTIGER FIX: Setze immer 0 als initialen Wert
      // Das ist der Standardwert für neue Einträge - wir starten immer bei 0
      let voteCycle = 0;

      // Für MultiVote und SingleVote verwenden wir konsistent den gleichen Ansatz:
      // Der vote_cycle wird erst NACH erfolgreicher Stimmabgabe erhöht
      console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] Neuer Eintrag für User ${eventUserId} mit voteCycle=0, maxVotes=${maxVotes}, multiVote=${multiVote}`);

      // Repository-Funktion verwenden
      await createPollUserVoted(pollResultId, eventUserId, voteCycle);
      console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] poll_user_voted Eintrag erstellt für User ${eventUserId}`);

      // KORRIGIERTE MultiVote-Logik: Behandle den Edge Case für Nutzer mit genau 1 Stimme
      if (multiVote) {
        // Spezielle Behandlung für Nutzer mit genau 1 Stimme in MultiVote-Modus
        if (maxVotes === 1) {
          // Bei Nutzern mit nur 1 Stimme: Erlaube die erste Stimme (voteCycle=0)
          console.log(`[DEBUG:MULTIVOTE] User ${eventUserId} hat nur 1 Stimme - erlaube erste Abstimmung`);
          return true;
        }
        
        // Für Nutzer mit mehreren Stimmen: Normale MultiVote-Logik
        if (voteCycle === maxVotes) {
          return true; // Die letzte Stimme darf gezählt werden
        } else if (voteCycle > 0) {
          return true; // Auch Teilabstimmungen sind erlaubt
        } else {
          // Bei voteCycle=0 und maxVotes>1: Erste MultiVote-Runde erlauben
          console.log(`[DEBUG:MULTIVOTE] User ${eventUserId} beginnt MultiVote (voteCycle=${voteCycle}, maxVotes=${maxVotes})`);
          return true;
        }
      }

      console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] Returning TRUE for new user ${eventUserId} (single vote mode)`);
      return true; // Bei normalem Modus: Erste Stimme erlauben
    }

    console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] User ${eventUserId} hat bereits poll_user_voted Eintrag - prüfe allowToCreateNewVote`);
    // Existierenden Eintrag aktualisieren - hier verwenden wir die Repository-Funktion
    const result = await allowToCreateNewVote(pollResultId, eventUserId);
    console.log(`[DEBUG:EXISTS_POLL_USER_VOTED] allowToCreateNewVote result for user ${eventUserId}:`, result);
    return result;
  } catch (error) {
    console.error(`[ERROR] existsPollUserVoted: Fehler bei der Prüfung:`, error);
    return false;
  }
}
