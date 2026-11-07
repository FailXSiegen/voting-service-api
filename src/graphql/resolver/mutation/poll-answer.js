import {
  findLeftAnswersCount,
  findLeftAnswersCountForAsync,
  closePollResult,
} from '../../../repository/poll/poll-result-repository';
import { findEventIdByPollResultId } from '../../../repository/event-repository';
import { pubsub } from '../../../server/graphql';
import { POLL_ANSWER_LIFE_CYCLE, POLL_LIFE_CYCLE } from '../subscription/subscription-types';
import {
  ALL_REMAINING_BALLOTS,
  VoteRejectedError,
  submitBallots,
} from '../../../service/poll-service';
import { query } from '../../../lib/database';

// no-console-check

/**
 * Publishes a POLL_LIFE_CYCLE event with the "closed" state
 * Ensures all necessary poll data is included for proper client-side processing
 *
 * @param {number} pollResultId - The ID of the poll result
 * @param {number} eventId - The ID of the event
 * @param {number|null} pollId - Optional poll ID (will be fetched if not provided)
 * @returns {Promise<void>}
 */
async function publishPollClosedEvent(pollResultId, eventId, pollId = null) {
  // First ensure the poll_result is actually closed in the database
  // Da wir kein vollständiges Objekt mit ID haben, nutzen wir den direkten query-Ansatz
  await query('UPDATE poll_result SET closed = 1 WHERE id = ?', [pollResultId], {
    throwError: true,
  });
  // Fetch poll_id if not provided
  if (!pollId) {
    const pollQuery = await query('SELECT poll_id AS pollId FROM poll_result WHERE id = ?', [
      pollResultId,
    ]);
    pollId = Array.isArray(pollQuery) && pollQuery.length > 0 ? pollQuery[0].pollId : null;
  }

  if (!pollId) {
    console.error(`[ERROR:POLL_LIFECYCLE] Could not find poll_id for poll_result ${pollResultId}`);
    return;
  }

  // Fetch complete poll data
  const completePollQuery = await query(
    `SELECT id, title, poll_answer AS pollAnswer, type, list, min_votes AS minVotes, 
            max_votes AS maxVotes, allow_abstain AS allowAbstain
     FROM poll WHERE id = ?`,
    [pollId]
  );

  // Fetch possible answers
  const possibleAnswersQuery = await query(
    'SELECT id, content FROM poll_possible_answer WHERE poll_id = ?',
    [pollId]
  );

  let completePoll =
    Array.isArray(completePollQuery) && completePollQuery.length > 0 ? completePollQuery[0] : null;

  const possibleAnswers = Array.isArray(possibleAnswersQuery) ? possibleAnswersQuery : [];

  if (!completePoll) {
    console.error(`[ERROR:POLL_LIFECYCLE] Could not find complete poll data for poll ${pollId}`);

    // Create fallback object with default values for non-nullable fields
    completePoll = {
      id: pollId,
      title: '[Unknown Poll]',
      pollAnswer: '',
      type: 'SECRET',
      list: false,
      minVotes: 0,
      maxVotes: 0,
      allowAbstain: false,
      possibleAnswers: [],
    };

    console.warn(`[WARN:POLL_LIFECYCLE] Using fallback poll data due to missing information`);
  }

  // Add possible answers to the poll object
  completePoll.possibleAnswers = possibleAnswers;

  // Publish the event
  // CRITICAL: When publishing poll closed events, we must ensure they are delivered
  // Don't throttle, don't debounce, but still deduplicate just in case
  // Force immediate delivery with priority flag
  pubsub.publish(
    POLL_LIFE_CYCLE,
    {
      eventId: eventId,
      state: 'closed',
      poll: completePoll,
      pollResultId: pollResultId,
    },
    {
      // No throttling for poll state changes - critical real-time updates
      throttleMs: 0,
      debounceMs: 0,
      cacheState: true,
      skipIfEqual: false, // Always send even if payload looks the same
      filterBy: { pollResultId, state: 'closed' },
      priority: true, // Mark as high priority event
    }
  );
}

/**
 * Helper function to check if an event is asynchronous
 */
async function isAsyncEvent(eventId) {
  const eventQuery = await query('SELECT async FROM event WHERE id = ?', [eventId]);

  return Array.isArray(eventQuery) && eventQuery.length > 0 && eventQuery[0].async === 1;
}

async function publishPollLifeCycle(pollResultId) {
  const eventId = await findEventIdByPollResultId(pollResultId);
  if (!eventId) {
    console.warn('Could not execute publishPollLifeCycle. Missing "eventId" or "pollResultId"', {
      pollResultId,
      eventId,
    });
    return;
  }

  // Check if this is an async event - don't auto-close async event polls
  if (await isAsyncEvent(eventId)) {
    console.info(
      `[INFO:POLL_LIFECYCLE] Skipping auto-close for async event ${eventId}, poll ${pollResultId}`
    );
    return;
  }

  // Close the poll and verify it was closed successfully (only for synchronous events)
  await closePollResult(pollResultId);
  await publishPollClosedEvent(pollResultId, eventId);
}

/**
 * Wähler-ID ausschließlich aus dem JWT (SEC-08). input.eventUserId wird nur noch akzeptiert,
 * damit alte Clients weiter funktionieren, und von protectMutations gegen den JWT geprüft.
 * Ohne ENABLE_JWT (nur lokale Entwicklung) gilt weiter input.eventUserId.
 */
function voterId(input, context) {
  if (context?.user?.type === 'event-user') {
    return context.user.id;
  }
  if (process.env.ENABLE_JWT !== '1') {
    return input.eventUserId;
  }
  throw new VoteRejectedError('only participants can vote');
}

/**
 * Nach erfolgreicher Stimmabgabe: Zähler veröffentlichen bzw. Abstimmung schließen,
 * wenn alle abgestimmt haben (nicht bei asynchronen Events). Fehler hier dürfen die bereits
 * gespeicherte Stimme nicht als gescheitert melden – daher nur loggen.
 */
async function afterVote({ pollResultId, eventId }) {
  try {
    const isAsync = await isAsyncEvent(eventId);
    const left = isAsync
      ? await findLeftAnswersCountForAsync(pollResultId)
      : await findLeftAnswersCount(pollResultId);

    if (!left) {
      // Abstimmung geschlossen oder alle haben alle Stimmen abgegeben.
      await publishPollLifeCycle(pollResultId);
      return;
    }

    pubsub.publish(
      POLL_ANSWER_LIFE_CYCLE,
      {
        pollResultId: left.pollResultId || 0,
        maxVotes: left.maxVotes || 0,
        maxVoteCycles: left.maxVoteCycles || 0,
        pollUserVoteCycles: left.pollUserVoteCycles || 0,
        pollUserVotedCount: left.pollUserVotedCount || 0,
        pollAnswersCount: left.pollAnswersCount || 0,
        pollUserCount: left.pollUserCount || 0,
        usersCompletedVoting: left.usersCompletedVoting || 0,
        eventId,
      },
      {
        throttleMs: 1000,
        cacheState: true,
        filterBy: { pollResultId: left.pollResultId },
        compareFields: ['pollUserVotedCount', 'pollAnswersCount', 'usersCompletedVoting'],
      }
    );
  } catch (error) {
    console.error('[ERROR:VOTE] Post-vote processing failed:', error.message);
  }
}

/**
 * Gemeinsamer Ablauf aller drei Vote-Mutationen. Wirft bei ungültigen Eingaben und DB-Fehlern
 * (Transaktion ist dann zurückgerollt, SEC-05). Gibt die Anzahl angenommener Stimmzettel zurück.
 */
async function vote(context, input, answerIds, ballots) {
  const outcome = await submitBallots({
    eventUserId: voterId(input, context),
    pollId: input.pollId,
    answerIds,
    ballots,
  });

  if (outcome.status === 'closed') {
    // Client über das Ende informieren (wie bisher), Stimme wird nicht gezählt.
    await publishPollClosedEvent(outcome.pollResultId, outcome.eventId, outcome.pollId);
    return 0;
  }
  if (outcome.status === 'exhausted') {
    return 0;
  }

  await afterVote(outcome);
  return outcome.ballots;
}

// Felder wie type, voteCycle, answerItemCount, answerItemLength, isLastAnswerInBallot,
// answerContent und eventUserId werden aus Kompatibilität angenommen, aber ignoriert:
// Typ, Antworttext, Wähler und Kontingent kommen ausschließlich aus der DB (SEC-01/02/07).
export default {
  // Ein Stimmzettel mit genau einer Antwort. multivote=true setzt alle übrigen Stimmen ein.
  createPollSubmitAnswer: async (_, { input }, context) => {
    const ballots = input.multivote === true ? ALL_REMAINING_BALLOTS : 1;
    const accepted = await vote(context, input, [input.possibleAnswerId ?? null], ballots);
    return accepted > 0;
  },

  // voteCount identische Stimmzettel mit genau einer Antwort.
  createBulkPollSubmitAnswer: async (_, { input }, context) => {
    return vote(context, input, [input.possibleAnswerId ?? null], input.voteCount);
  },

  // voteCount identische Stimmzettel mit mehreren unterschiedlichen Antworten.
  createMultiPollSubmitAnswer: async (_, { input }, context) => {
    const answers = Array.isArray(input.answers) ? input.answers : [];
    const counts = new Set(answers.map((answer) => parseInt(answer.voteCount, 10)));
    if (counts.size !== 1) {
      throw new VoteRejectedError('all answers of a ballot need the same vote count');
    }
    return vote(
      context,
      input,
      answers.map((answer) => answer.possibleAnswerId ?? null),
      [...counts][0]
    );
  },
};
