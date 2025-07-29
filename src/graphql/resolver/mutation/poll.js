import { findById as findOneEventById } from "../../../repository/event-repository";
import {
  create as createPoll,
  remove as removePoll,
  update as updatePoll,
  findOneById,
} from "../../../repository/poll/poll-repository";
import { create as createPossibleAnswer } from "../../../repository/poll/poll-possible-answer-repository";
import {
  closePollResult,
  create as createPollResult,
  findOneById as findOnePollResultById,
} from "../../../repository/poll/poll-result-repository";
import { create as createPollUser } from "../../../repository/poll/poll-user-repository";
import {
  findOnlineEventUserByEventId,
  findVotableEventUserByEventId,
} from "../../../repository/event-user-repository";
import { pubsub } from "../../../server/graphql";
import { POLL_LIFE_CYCLE } from "../subscription/subscription-types";
import { query } from "../../../lib/database";

export default {
  createPoll: async (_, args) => {
    const poll = args.input;
    const possibleAnswers = args.input.possibleAnswers;
    delete poll.possibleAnswers;
    const pollId = await createPoll(poll);
    for await (const answerInput of possibleAnswers) {
      await createPossibleAnswer({ pollId, content: answerInput.content });
    }
    const event = await findOneEventById(poll.eventId);
    const pollRecord = await findOneById(pollId);
    
    // Lade die möglichen Antworten für das vollständige Poll-Objekt
    const possibleAnswersQuery = await query(
      "SELECT id, content FROM poll_possible_answer WHERE poll_id = ?",
      [pollId]
    );
    const completePoll = {
      ...pollRecord,
      possibleAnswers: Array.isArray(possibleAnswersQuery) ? possibleAnswersQuery : []
    };
    
    if (args.instantStart) {
      const pollResultId = await createPollDependencies(
        pollRecord,
        await findOnlineEventUserByEventId(pollRecord.eventId),
      );
      if (pollResultId) {
        pubsub.publish(POLL_LIFE_CYCLE, {
          eventId: poll.eventId,
          state: "new",
          poll: completePoll,
          pollResultId: pollResultId,
        }, { priority: true });
      }
    } else if (event?.async) {
      await createPollDependencies(
        pollRecord,
        await findVotableEventUserByEventId(pollRecord.eventId),
      );
    }

    return pollRecord;
  },
  updatePoll: async (_, args) => {
    const poll = args.input;
    const possibleAnswers = args.input.possibleAnswers;
    delete poll.possibleAnswers;
    const pollId = poll.id;
    await updatePoll(poll);
    for await (const answerInput of possibleAnswers) {
      await createPossibleAnswer({ pollId, content: answerInput.content });
    }
    const pollRecord = await findOneById(pollId);
    
    // Lade die möglichen Antworten für das vollständige Poll-Objekt
    const possibleAnswersQuery = await query(
      "SELECT id, content FROM poll_possible_answer WHERE poll_id = ?",
      [pollId]
    );
    const completePoll = {
      ...pollRecord,
      possibleAnswers: Array.isArray(possibleAnswersQuery) ? possibleAnswersQuery : []
    };
    
    if (args.instantStart) {
      const pollResultId = await createPollDependencies(
        pollRecord,
        await findOnlineEventUserByEventId(pollRecord.eventId),
      );
      if (pollResultId) {
        pubsub.publish(POLL_LIFE_CYCLE, {
          eventId: poll.eventId,
          state: "new",
          poll: completePoll,
          pollResultId: pollResultId,
        }, { priority: true });
      }
    }
    return pollRecord;
  },
  startPoll: async (_, { id }) => {
    const pollRecord = await findOneById(id);
    if (pollRecord === null) {
      throw new Error(`Poll with id ${id} not found!`);
    }
    
    // Lade die möglichen Antworten für das vollständige Poll-Objekt
    const possibleAnswersQuery = await query(
      "SELECT id, content FROM poll_possible_answer WHERE poll_id = ?",
      [id]
    );
    const completePoll = {
      ...pollRecord,
      possibleAnswers: Array.isArray(possibleAnswersQuery) ? possibleAnswersQuery : []
    };
    
    const pollResultId = await createPollDependencies(
      pollRecord,
      await findOnlineEventUserByEventId(pollRecord.eventId),
    );
    if (pollResultId) {
      pubsub.publish(POLL_LIFE_CYCLE, {
        eventId: pollRecord.eventId,
        state: "new",
        poll: completePoll,
        pollResultId: pollResultId
      }, { priority: true });
    }
    return pollRecord;
  },
  stopPoll: async (_, { id }) => {
    const pollResult = await findOnePollResultById(id);
    if (pollResult === null) {
      throw new Error(`Poll result with id ${id} not found!`);
    }
    const poll = await findOneById(pollResult.pollId);
    if (poll === null) {
      throw new Error(`Poll with id ${pollResult.pollId} not found!`);
    }
    await closePollResult(id);

    // Vollständiges Poll-Objekt mit allen erforderlichen Feldern abrufen
    const completePollQuery = await query(
      `SELECT id, title, poll_answer AS pollAnswer, type, list, min_votes AS minVotes, 
              max_votes AS maxVotes, allow_abstain AS allowAbstain
       FROM poll WHERE id = ?`,
      [poll.id]
    );

    // Mögliche Antworten abrufen
    const possibleAnswersQuery = await query(
      "SELECT id, content FROM poll_possible_answer WHERE poll_id = ?",
      [poll.id]
    );

    const completePoll = Array.isArray(completePollQuery) && completePollQuery.length > 0
      ? completePollQuery[0]
      : poll; // Fallback auf das bereits vorhandene Objekt

    const possibleAnswers = Array.isArray(possibleAnswersQuery)
      ? possibleAnswersQuery
      : [];

    // Füge die möglichen Antworten hinzu
    completePoll.possibleAnswers = possibleAnswers;

    pubsub.publish(POLL_LIFE_CYCLE, {
      eventId: poll.eventId,
      state: "closed",
      poll: completePoll, // Vollständiges Poll-Objekt mit allen erforderlichen Feldern
      pollResultId: id
    }, { priority: true });

    return true;
  },
  removePoll: async (_, { id }) => {
    return await removePoll(id);
  },
};

async function createPollDependencies(pollRecord, eventUsers) {
  let maxPollVotes = 0;
  if (!eventUsers || !eventUsers?.length > 0) {
    // Prüfe ob es ein asynchrones Event ist
    const event = await findOneEventById(pollRecord.eventId);
    if (!event?.async) {
      // Nur bei normalen Events einen Fehler werfen
      throw new Error("No event users found!");
    }
    // Bei asynchronen Events: Erstelle poll_result auch ohne EventUser
    return await createPollResult({
      pollId: pollRecord.id,
      type: pollRecord.type,
      maxVotes: 0,
      maxVoteCycles: 0,
    });
  }
  for await (const eventUser of eventUsers) {
    maxPollVotes += eventUser.voteAmount;
    await createPollUser({
      eventUserId: eventUser.id,
      publicName: eventUser.publicName,
      username: eventUser.username,
      pollId: pollRecord.id,
    });
  }
  const maxPollVoteCycles = maxPollVotes;
  maxPollVotes = pollRecord.maxVotes * maxPollVotes;
  return await createPollResult({
    pollId: pollRecord.id,
    type: pollRecord.type,
    maxVotes: maxPollVotes,
    maxVoteCycles: maxPollVoteCycles,
  });
}
