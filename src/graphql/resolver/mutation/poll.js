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
    if (args.instantStart) {
      const pollResultId = await createPollDependencies(
        pollRecord,
        await findOnlineEventUserByEventId(pollRecord.eventId),
      );
      if (pollResultId) {
        pubsub.publish(POLL_LIFE_CYCLE, {
          eventId: poll.eventId,
          state: "new",
          poll: pollRecord,
          pollResultId: pollResultId,
        });
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
    if (args.instantStart) {
      const pollResultId = await createPollDependencies(
        pollRecord,
        await findOnlineEventUserByEventId(pollRecord.eventId),
      );
      if (pollResultId) {
        pubsub.publish(POLL_LIFE_CYCLE, {
          eventId: poll.eventId,
          state: "new",
          poll: pollRecord,
          pollResultId: pollResultId,
        });
      }
    }
    return pollRecord;
  },
  startPoll: async (_, { id }) => {
    const pollRecord = await findOneById(id);
    if (pollRecord === null) {
      throw new Error(`Poll with id ${id} not found!`);
    }
    const pollResultId = await createPollDependencies(
      pollRecord,
      await findOnlineEventUserByEventId(pollRecord.eventId),
    );
    if (pollResultId) {
      pubsub.publish(POLL_LIFE_CYCLE, {
        eventId: pollRecord.eventId,
        state: "new",
        pollRecord,
        pollResultId,
      });
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
    pubsub.publish(POLL_LIFE_CYCLE, {
      eventId: poll.eventId,
      state: "closed",
    });
    return true;
  },
  removePoll: async (_, { id }) => {
    return await removePoll(id);
  },
};

async function createPollDependencies(pollRecord, eventUsers) {
  let maxPollVotes = 0;
  if (!eventUsers || !eventUsers?.length > 0) {
    throw new Error("No event users found!");
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
