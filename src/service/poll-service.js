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
    // Prüfe, ob der Benutzer bereits in dieser Abstimmung abgestimmt hat
    const userExists = await existInCurrentVote(pollResultId, eventUserId);
    // Benutzerinformationen abrufen
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      console.error(`[ERROR] existsPollUserVoted: Benutzer mit ID ${eventUserId} nicht gefunden`);
      return false;
    }

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
      // Ein erster Vote-Cycle von 1 ist der Standardwert für neue Einträge
      // Falls multiVote aktiviert ist und der Client hat mehr angefordert, kann der Wert erhöht werden

      // Das ist der Standardwert für neue Einträge
      let voteCycle = 0;

      // Wenn multiVote aktiv ist, können wir einen höheren Wert setzen, aber maximal bis maxVotes
      if (multiVote) {
        // Der Client sendet die gewünschte Anzahl der Stimmen, aber wir begrenzen auf maxVotes
        const requestedVotes = input?.voteCycle || 1;
        voteCycle = Math.min(maxVotes, Math.max(1, requestedVotes));
      }

      // Repository-Funktion verwenden
      await createPollUserVoted(pollResultId, eventUserId, voteCycle);

      // Bei MultiVote: Wenn genau die maximale Anzahl von Stimmen angefordert wurde, erlauben wir die Stimmabgabe
      if (multiVote) {
        if (voteCycle === maxVotes) {
          return true; // Die letzte Stimme darf gezählt werden
        } else if (voteCycle > 0) {
          return true; // Auch Teilabstimmungen sind erlaubt
        } else {
          return false;
        }
      }

      return true; // Bei normalem Modus: Erste Stimme erlauben
    }

    // Existierenden Eintrag aktualisieren - hier verwenden wir die Repository-Funktion
    return await allowToCreateNewVote(pollResultId, eventUserId);
  } catch (error) {
    console.error(`[ERROR] existsPollUserVoted: Fehler bei der Prüfung:`, error);
    return false;
  }
}
