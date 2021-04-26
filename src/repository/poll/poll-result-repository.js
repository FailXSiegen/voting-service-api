import {
  insert,
  update as updateQuery,
  remove as removeQuery, query
} from './../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function findOneById (id) {
  const result = await query('SELECT * FROM poll_result WHERE id = ?', [id])
  return Array.isArray(result) ? result[0] || null : null
}

export async function updatePollResultMaxVotes (pollResultId, eventUserId) {
  const maxVotes = await query('SELECT vote_amount FROM event_user WHERE id = ?', [eventUserId])
  if (!Array.isArray(maxVotes) || maxVotes[0].voteAmount === 0) {
    return false
  }
  await query('UPDATE poll_result SET max_votes = max_votes + ?,  max_vote_cycles = max_vote_cycles + ? WHERE id = ?', [maxVotes[0].voteAmount, maxVotes[0].voteAmount, pollResultId])
  return true
}

export async function findClosedPollResults (eventId, page, pageSize) {
  const offset = page * pageSize
  return await query(`
    SELECT poll_result.*
    FROM poll_result
    INNER JOIN poll ON poll.id = poll_result.poll_id
    WHERE poll.event_id = ?
    AND poll_result.closed = ?
    ORDER BY create_datetime DESC
    LIMIT ? OFFSET ?
  `,
  [eventId, true, pageSize, offset])
}

export async function findLeftAnswersCount (pollResultId) {
  const result = await query(`
    SELECT poll_result.id as poll_result_id,
    poll_result.max_votes AS max_votes,
    poll_result.max_vote_cycles AS max_vote_cycles,
    (SELECT COALESCE(SUM(poll_user_voted.vote_cycle),0) FROM poll_user_voted WHERE poll_user_voted.poll_result_id = poll_result.id) AS poll_user_vote_cycles,
    (SELECT COUNT(poll_user_voted.id) FROM poll_user_voted WHERE poll_user_voted.poll_result_id = poll_result.id) AS poll_user_voted_count,
    (SELECT COUNT(*) FROM poll_answer WHERE poll_answer.poll_result_id = poll_result.id) AS poll_answers_count,
    (SELECT COUNT(event_user.id) FROM poll INNER JOIN event_user ON poll.event_id = event_user.event_id WHERE poll.id = poll_result.poll_id AND event_user.verified = 1 AND event_user.allow_to_vote = 1 AND event_user.online = 1 ) AS poll_user_count
    FROM poll_result
    WHERE poll_result.id = ?
    GROUP BY poll_result_id
    HAVING poll_answers_count < max_votes AND poll_user_vote_cycles < max_vote_cycles
  `, [pollResultId])
  return Array.isArray(result) ? result[0] || null : null
}

export async function closePollResult (id) {
  await query(
    'UPDATE poll_result SET closed = ? WHERE id = ?',
    [1, id]
  )
}

export async function findActivePoll (eventId) {
  const result = await query(`
  SELECT
    poll_result.id AS id,
    poll.title AS title,
    poll_result.max_votes AS max_votes,
    (SELECT COUNT(poll_user.event_user_id) FROM poll_user WHERE poll_user.poll_id = poll.id) AS pollUserCount,
    (SELECT COUNT(poll_user_voted.id) FROM poll_user_voted WHERE poll_user_voted.poll_result_id = poll_result.id) AS pollUserVotedCount,
    (SELECT COUNT(poll_answer.id) FROM poll_answer WHERE poll_answer.poll_result_id = poll_result.id) AS answerCount
  FROM poll
  INNER JOIN poll_result ON poll.id = poll_result.poll_id
  WHERE poll.event_id = ? AND poll_result.closed = 0
  GROUP BY poll.id
  `,
  [eventId])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findActivePollByUserId (eventUserId) {
  const result = await query(`
  SELECT
    poll_result.id AS id
  FROM poll
  INNER JOIN poll_result ON poll.id = poll_result.poll_id
  INNER JOIN event_user ON poll.event_id = event_user.event_id
  WHERE event_user.id = ? AND poll_result.closed = 0
  GROUP BY poll.id
  `,
  [eventUserId])
  return Array.isArray(result) ? result[0] || null : null
}

export async function getPollOverview (eventId) {
  return await query(`
  SELECT
    poll.id, 
    poll.title, 
    poll.max_votes AS 'abzugebende Stimmen',
    (SELECT COUNT(poll_user.id) FROM poll_user WHERE poll_user.poll_id = poll.id) AS Teilnehmer,
    (SELECT COUNT(poll_user_voted.id) FROM poll_user_voted WHERE poll_user_voted.poll_result_id = poll_result.id) AS Abgestimmt,
    poll_result.max_votes AS 'maximale Stimmanzahl (Faktor abzugebenden Stimmen beachten)',
    (SELECT COUNT(poll_answer.id) FROM poll_answer WHERE poll_answer.poll_result_id = poll_result.id) AS 'abgegebene Stimmen (Delegiert mit Mehrfachstimmen beachten)'
    FROM
    poll
    INNER JOIN poll_result ON poll_result.poll_id = poll.id
    WHERE poll.event_id = ?
  `,
  [eventId])
}

export async function getPollResults (eventId) {
  return await query(`
    SELECT
    poll.id,
    poll.title AS Abstimmung,
    poll_answer.answer_content AS Antworten,
    COUNT(poll_answer.id) AS Anzahl
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    INNER JOIN poll_answer ON poll_answer.poll_result_id = poll_result.id
    WHERE poll.event_id = ?
    GROUP BY poll_result.id, poll_answer.answer_content
  `,
  [eventId])
}

export async function getPollResultsDetails (eventId) {
  return await query(`
    SELECT
    poll.id,
    poll.title AS Abstimmung,
    poll_answer.answer_content AS Antwort,
    poll_user.public_name AS Person,
    poll_user.username AS Benutzername
    FROM poll_result
    INNER JOIN poll ON poll_result.poll_id = poll.id
    INNER JOIN poll_answer ON poll_answer.poll_result_id = poll_result.id
    LEFT JOIN poll_user ON poll_user.id = poll_answer.poll_user_id
    WHERE poll.event_id = ?
  `,
  [eventId])
}

export async function getEventUsersWithVoteCount (eventId) {
  return await query(`
  SELECT
  poll_user.public_name AS Person,
  poll_user.username AS Benutzername,
  count(poll_user.event_user_id ) as Anzahl
  FROM poll_user
  INNER JOIN poll
  ON poll_user.poll_id = poll.id
  WHERE poll.event_id = ?
  GROUP BY poll_user.event_user_id 
  `,
  [eventId])
}

export async function findActivePollEventUser (eventId) {
  const result = await query(`
  SELECT 'new' AS state, poll.id AS poll, poll_result.id AS poll_result_id
  FROM poll
  INNER JOIN poll_result ON poll.id = poll_result.poll_id
  WHERE poll.event_id = ? AND poll_result.closed = 0
  GROUP BY poll.id
  `,
  [eventId])
  return Array.isArray(result) ? result[0] || null : null
}

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  return await insert('poll_result', input)
}

export async function update (input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp()
  await updateQuery('poll_result', input)
}

export async function remove (id) {
  return await removeQuery('poll_result', id)
}
