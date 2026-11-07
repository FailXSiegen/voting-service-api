import { escapeId, insert, query, withTransaction } from './../../lib/database';
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp';
import { pollTypeConverterToString } from '../../graphql/resolver/poll/poll';

export async function findOneById(id) {
  const result = await query('SELECT * FROM poll WHERE id = ?', [id]);
  return Array.isArray(result) ? result[0] || null : null;
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  input.type = pollTypeConverterToString(input.type);
  return await insert('poll', input);
}

// SEC-29: Nach Beginn der Stimmabgabe darf eine Abstimmung weder geändert noch gelöscht werden
// (bisher wurde poll_user_voted gelöscht, das Löschen von poll_result scheiterte still am
// Fremdschlüssel – danach konnten alle erneut abstimmen). Bei synchronen Events ist die
// Abstimmung schon ab dem Start gesperrt, bei asynchronen (poll_result entsteht beim Anlegen)
// ab der ersten Stimme. Alles läuft in einer Transaktion.
async function lockEditablePoll(tx, pollId) {
  const [poll] = await tx.query(
    `SELECT poll.id, event.async AS isAsync FROM poll
     INNER JOIN event ON event.id = poll.event_id
     WHERE poll.id = ? FOR UPDATE`,
    [pollId]
  );
  if (!poll) {
    throw new Error(`Poll with id ${pollId} not found!`);
  }
  const [usage] = await tx.query(
    `SELECT
       (SELECT COUNT(*) FROM poll_result WHERE poll_id = ?) AS results,
       (SELECT COUNT(*) FROM poll_user_voted puv
          INNER JOIN poll_result pr ON pr.id = puv.poll_result_id WHERE pr.poll_id = ?) AS voted,
       (SELECT COUNT(*) FROM poll_answer pa
          INNER JOIN poll_result pr ON pr.id = pa.poll_result_id WHERE pr.poll_id = ?) AS answers`,
    [pollId, pollId, pollId]
  );
  const hasVotes = Number(usage.voted) > 0 || Number(usage.answers) > 0;
  if (hasVotes || (!poll.isAsync && Number(usage.results) > 0)) {
    throw new Error('Poll cannot be changed or removed once it has been started or voted on.');
  }
}

// Spalten, die updatePoll ändern darf (event_id bewusst nicht).
const UPDATABLE_POLL_FIELDS = {
  title: 'title',
  pollAnswer: 'poll_answer',
  list: 'list',
  type: 'type',
  minVotes: 'min_votes',
  maxVotes: 'max_votes',
  allowAbstain: 'allow_abstain',
};

async function deletePollReferences(tx, pollId) {
  await tx.query(
    `DELETE poll_user_voted FROM poll_user_voted
     INNER JOIN poll_result ON poll_result.id = poll_user_voted.poll_result_id
     WHERE poll_result.poll_id = ?`,
    [pollId]
  );
  await tx.query('DELETE FROM poll_result WHERE poll_id = ?', [pollId]);
  await tx.query('DELETE FROM poll_possible_answer WHERE poll_id = ?', [pollId]);
  await tx.query('DELETE FROM poll_user WHERE poll_id = ?', [pollId]);
}

/**
 * Ändert eine Abstimmung samt Antwortoptionen. Die Event-Zugehörigkeit bleibt unverändert.
 * @param {object} input UpdatePollInput (ohne possibleAnswers)
 * @param {Array<{content: string}>} possibleAnswers
 */
export async function update(input, possibleAnswers = []) {
  const pollId = parseInt(input.id, 10);
  await withTransaction(async (tx) => {
    await lockEditablePoll(tx, pollId);
    await deletePollReferences(tx, pollId);
    const changes = { create_datetime: getCurrentUnixTimeStamp() };
    for (const [field, column] of Object.entries(UPDATABLE_POLL_FIELDS)) {
      if (input[field] !== undefined) {
        changes[column] = field === 'type' ? pollTypeConverterToString(input.type) : input[field];
      }
    }
    const columns = Object.keys(changes);
    await tx.query(
      `UPDATE poll SET ${columns.map((column) => `${escapeId(column)} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((column) => changes[column]), pollId]
    );
    const now = getCurrentUnixTimeStamp();
    for (const answer of possibleAnswers || []) {
      await tx.query(
        'INSERT INTO poll_possible_answer (poll_id, content, create_datetime) VALUES (?, ?, ?)',
        [pollId, answer.content, now]
      );
    }
  });
}

export async function remove(id) {
  const pollId = parseInt(id, 10);
  return withTransaction(async (tx) => {
    await lockEditablePoll(tx, pollId);
    await deletePollReferences(tx, pollId);
    const result = await tx.query('DELETE FROM poll WHERE id = ?', [pollId]);
    return result.affectedRows > 0;
  });
}

export async function findPollsWithNoResults(eventId) {
  return await query(
    `
  SELECT poll.*
  FROM poll
  LEFT JOIN poll_result ON poll.id = poll_result.poll_id
  WHERE poll.event_id = ?
  AND poll_result.poll_id IS NULL
  `,
    [eventId]
  );
}

export async function findPollsByEventId(eventId) {
  return await query('SELECT poll.* FROM poll WHERE poll.event_id = ?', [eventId]);
}
