import {
  updatePollResultMaxVotes,
  findLeftAnswersCount,
} from '../repository/poll/poll-result-repository';
import {
  createPollUserWithPollResultId,
  existAsPollUserInCurrentVote,
} from '../repository/poll/poll-user-repository';
import { pubsub } from '../server/graphql';
import { POLL_ANSWER_LIFE_CYCLE } from '../graphql/resolver/subscription/subscription-types';
import { query, withTransaction } from '../lib/database';
import { randomInt } from 'crypto';
import { getCurrentUnixTimeStamp } from '../lib/time-stamp';

/**
 * Creates a new poll user record, if the event-user id does not yet exist.
 * @param {number} pollResultId
 * @param {number} eventUserId
 */
export async function createPollUserIfNeeded(pollResultId, eventUserId) {
  try {
    const userExists = await existAsPollUserInCurrentVote(pollResultId, eventUserId);

    // userExists === null bedeutet, dass der Nutzer nicht existiert
    // userExists ist ein Array, wenn der Nutzer gefunden wurde
    if (!userExists || userExists.length === 0) {
      const result = await createPollUserWithPollResultId(pollResultId, eventUserId);

      if (result) {
        await updatePollResultMaxVotes(pollResultId, eventUserId);

        // Nach dem Hinzufügen des Benutzers die aktuellen Zahlen holen und ein Subscription-Event auslösen
        try {
          // Event-ID aus der Poll-ID ermitteln
          const eventIdResult = await query(
            'SELECT poll.event_id FROM poll INNER JOIN poll_result ON poll.id = poll_result.poll_id WHERE poll_result.id = ?',
            [pollResultId]
          );

          const eventId = eventIdResult?.[0]?.event_id;

          if (eventId) {
            // Aktuelle Abstimmungszahlen abrufen
            const leftAnswersDataSet = await findLeftAnswersCount(pollResultId);

            // Event auslösen, um alle Clients zu aktualisieren
            if (leftAnswersDataSet) {
              pubsub.publish(
                POLL_ANSWER_LIFE_CYCLE,
                {
                  ...leftAnswersDataSet,
                  eventId: eventId,
                },
                { filterBy: { eventId: eventId } }
              );
            }
          }
        } catch (error) {
          console.error('[ERROR] Fehler beim Aktualisieren der Teilnehmerzahlen:', error);
        }

        return { success: true, message: 'User added to poll' };
      }

      return { success: false, message: 'Failed to add user to poll' };
    } else {
      return { success: true, message: 'User already exists in poll' };
    }
  } catch (error) {
    console.error(`[ERROR] Error in createPollUserIfNeeded: ${error.message}`);
    console.error(error.stack);
    return { success: false, message: error.message };
  }
}

// ---------------------------------------------------------------------------------------------
// Stimmabgabe (Audit 2026-11-07, SEC-01 bis SEC-07, SEC-23)
//
// Ein Request = ein oder mehrere identische Stimmzettel = EINE Transaktion auf EINER Verbindung.
// Alles Sicherheitsrelevante kommt aus der DB: Event-Zugehörigkeit, Poll-Typ, Antwortoptionen,
// verified/allowToVote und das Restkontingent. Vom Client zählen nur: welche Poll, welche
// Antwort-IDs und wie viele der eigenen Stimmen eingesetzt werden sollen.
// ---------------------------------------------------------------------------------------------

const ABSTAIN_CONTENT = 'Enthaltung';
export const ALL_REMAINING_BALLOTS = Number.POSITIVE_INFINITY;
const POLL_TYPE_PUBLIC = 1;
const INSERT_CHUNK_SIZE = 500;
// Geheime Stimmen bekommen zufällige IDs (poll_answer.id ist BIGINT), damit sich aus der
// Reihenfolge keine Zuordnung zur Liste "wer hat abgestimmt" ableiten lässt.
const SECRET_ID_MAX = 2 ** 48;

export class VoteRejectedError extends Error {
  constructor(message) {
    super(`Vote rejected: ${message}`);
    this.name = 'VoteRejectedError';
  }
}

const reject = (message) => {
  throw new VoteRejectedError(message);
};

/** Nur positive Ganzzahlen (auch als String) sind gültige IDs – alles andere wird abgelehnt. */
function parseId(value, what) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)) {
    return Number(value);
  }
  return reject(`invalid ${what}`);
}

function validateAnswers(rawAnswerIds, poll, possibleAnswers) {
  if (!Array.isArray(rawAnswerIds) || rawAnswerIds.length === 0) {
    reject('no answer given');
  }
  const isAbstain = (id) => id === null || id === undefined || id === '';
  if (rawAnswerIds.some(isAbstain)) {
    if (rawAnswerIds.length !== 1) reject('abstention cannot be combined with answers');
    if (!poll.allowAbstain) reject('abstention is not allowed in this poll');
    return [{ possibleAnswerId: null, content: ABSTAIN_CONTENT }];
  }
  const byId = new Map(possibleAnswers.map((answer) => [Number(answer.id), answer]));
  const ids = rawAnswerIds.map((id) => parseId(id, 'possibleAnswerId'));
  if (new Set(ids).size !== ids.length) reject('duplicate answers');
  if (ids.some((id) => !byId.has(id))) reject('answer does not belong to this poll');
  const maxVotes = parseInt(poll.maxVotes, 10) || 0;
  const minVotes = parseInt(poll.minVotes, 10) || 0;
  if (maxVotes > 0 && ids.length > maxVotes) reject('too many answers');
  if (minVotes > 0 && ids.length < minVotes) reject('too few answers');
  return ids.map((id) => ({ possibleAnswerId: id, content: byId.get(id).content }));
}

async function findOrCreatePollUser(tx, poll, pollResultId, eventUser) {
  const existing = await tx.query(
    'SELECT id FROM poll_user WHERE poll_id = ? AND event_user_id = ? ORDER BY id LIMIT 1',
    [poll.id, eventUser.id]
  );
  if (existing.length > 0) {
    return existing[0].id;
  }
  // Spät beigetreten: wie createPollUserIfNeeded() Teilnehmer anlegen und Maximum erhöhen.
  const inserted = await tx.query(
    `INSERT INTO poll_user (event_user_id, public_name, username, poll_id, create_datetime)
     VALUES (?, ?, ?, ?, ?)`,
    [eventUser.id, eventUser.publicName, eventUser.username, poll.id, getCurrentUnixTimeStamp()]
  );
  await tx.query(
    'UPDATE poll_result SET max_votes = max_votes + ?, max_vote_cycles = max_vote_cycles + ? WHERE id = ?',
    [eventUser.voteAmount, eventUser.voteAmount, pollResultId]
  );
  return inserted.insertId;
}

async function insertAnswers(tx, rows, isSecret) {
  const columns = isSecret
    ? '(id, poll_result_id, poll_possible_answer_id, answer_content, poll_user_id, create_datetime)'
    : '(poll_result_id, poll_possible_answer_id, answer_content, poll_user_id, create_datetime)';
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    for (let attempt = 1; ; attempt++) {
      const values = isSecret ? chunk.map((row) => [randomInt(1, SECRET_ID_MAX), ...row]) : chunk;
      try {
        await tx.query(`INSERT INTO poll_answer ${columns} VALUES ?`, [values]);
        break;
      } catch (err) {
        // Kollision einer Zufalls-ID: Statement wurde von InnoDB zurückgerollt, neu würfeln.
        if (!isSecret || err?.code !== 'ER_DUP_ENTRY' || attempt >= 3) throw err;
      }
    }
  }
}

/**
 * Nimmt einen oder mehrere identische Stimmzettel atomar an.
 * @param {object} args
 * @param {number|string} args.eventUserId – aus dem JWT, nie aus dem Input
 * @param {number|string} args.pollId
 * @param {Array<number|string|null>} args.answerIds – IDs aus poll_possible_answer, [null] = Enthaltung
 * @param {number} args.ballots – gewünschte Anzahl Stimmzettel (ALL_REMAINING_BALLOTS = alle übrigen)
 * @returns {Promise<{status: 'ok'|'closed'|'exhausted', ballots: number, pollId: number,
 *   pollResultId: number|null, eventId: number}>}
 */
export async function submitBallots({ eventUserId, pollId, answerIds, ballots }) {
  const voterId = parseId(eventUserId, 'eventUserId');
  const parsedPollId = parseId(pollId, 'pollId');
  const requested =
    ballots === ALL_REMAINING_BALLOTS
      ? ballots
      : parseInt(ballots, 10) > 0
        ? parseInt(ballots, 10)
        : 0;
  if (!requested) reject('invalid vote count');

  return withTransaction(async (tx) => {
    // 1. Wähler sperren – serialisiert alle Stimmabgaben und Stimmübertragungen dieses Wählers.
    const [eventUser] = await tx.query(
      `SELECT id, event_id, username, public_name, verified, allow_to_vote, vote_amount
       FROM event_user WHERE id = ? FOR UPDATE`,
      [voterId]
    );
    if (!eventUser) reject('unknown voter');
    if (!eventUser.verified || !eventUser.allowToVote) reject('voter is not allowed to vote');
    const voteAmount = parseInt(eventUser.voteAmount, 10) || 0;
    if (voteAmount <= 0) reject('voter has no votes');

    // 2. Abstimmung muss zum Event des Wählers gehören.
    const [poll] = await tx.query(
      `SELECT id, event_id, type, min_votes, max_votes, allow_abstain FROM poll WHERE id = ?`,
      [parsedPollId]
    );
    if (!poll || Number(poll.eventId) !== Number(eventUser.eventId)) reject('unknown poll');
    const result = { pollId: poll.id, eventId: poll.eventId, pollResultId: null, ballots: 0 };

    // 3. Antworten gegen die Antwortoptionen dieser Abstimmung prüfen.
    const possibleAnswers = await tx.query(
      'SELECT id, content FROM poll_possible_answer WHERE poll_id = ?',
      [poll.id]
    );
    const answers = validateAnswers(answerIds, poll, possibleAnswers);

    // 4. Laufende Abstimmung (neuester poll_result) – vor dem Anlegen von Teilnehmern prüfen.
    const [current] = await tx.query(
      'SELECT id, closed FROM poll_result WHERE poll_id = ? ORDER BY id DESC LIMIT 1',
      [poll.id]
    );
    if (!current) reject('poll has not been started');
    result.pollResultId = current.id;
    if (Number(current.closed) === 1) return { ...result, status: 'closed' };

    const isSecret = Number(poll.type) !== POLL_TYPE_PUBLIC;
    const pollUserId = await findOrCreatePollUser(tx, poll, current.id, eventUser);
    await tx.query('UPDATE event_user SET online = 1 WHERE id = ? AND online = 0', [voterId]);

    // Schließen (UPDATE poll_result) wartet auf diese Sperre – keine Stimme nach Ende.
    const [locked] = await tx.query(
      'SELECT closed FROM poll_result WHERE id = ? LOCK IN SHARE MODE',
      [current.id]
    );
    if (!locked || Number(locked.closed) === 1) return { ...result, status: 'closed' };

    // 5. Kontingent: Zeile anlegen (Unique-Constraint), sperren, bedingt erhöhen.
    await tx.query(
      `INSERT INTO poll_user_voted (event_user_id, username, poll_result_id, vote_cycle, create_datetime, version)
       VALUES (?, ?, ?, 0, ?, 0)
       ON DUPLICATE KEY UPDATE id = id`,
      [voterId, eventUser.username, current.id, getCurrentUnixTimeStamp()]
    );
    const [voted] = await tx.query(
      'SELECT vote_cycle FROM poll_user_voted WHERE poll_result_id = ? AND event_user_id = ? FOR UPDATE',
      [current.id, voterId]
    );
    const used = parseInt(voted?.voteCycle, 10) || 0;
    const count = Math.min(requested, voteAmount - used);
    if (count <= 0) return { ...result, status: 'exhausted' };

    const updated = await tx.query(
      `UPDATE poll_user_voted SET vote_cycle = vote_cycle + ?, version = version + ?
       WHERE poll_result_id = ? AND event_user_id = ? AND vote_cycle + ? <= ?`,
      [count, count, current.id, voterId, count, voteAmount]
    );
    if (updated.affectedRows !== 1) {
      throw new Error('Vote quota update failed');
    }

    // 6. Stimmen schreiben – Inhalt aus der DB, Typ aus der DB, nur Platzhalter.
    const rows = [];
    for (let ballot = 0; ballot < count; ballot++) {
      for (const answer of answers) {
        rows.push(
          isSecret
            ? [current.id, answer.possibleAnswerId, answer.content, null, 0]
            : [
                current.id,
                answer.possibleAnswerId,
                answer.content,
                pollUserId,
                getCurrentUnixTimeStamp(),
              ]
        );
      }
    }
    await insertAnswers(tx, rows, isSecret);

    return { ...result, status: 'ok', ballots: count };
  });
}
