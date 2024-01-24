import { insertPollSubmitAnswer } from "../../../repository/poll/poll-answer-repository";
import {
  findLeftAnswersCount,
  closePollResult,
  findOneByPollId,
} from "../../../repository/poll/poll-result-repository";
import {
  findEventIdByPollResultId,
  getMultivoteType,
} from "../../../repository/event-repository";
import { findOneById } from "../../../repository/event-user-repository";
import { pubsub } from "../../../server/graphql";
import {
  POLL_ANSWER_LIFE_CYCLE,
  POLL_LIFE_CYCLE,
} from "../subscription/subscription-types";
import {
  createPollUserIfNeeded,
  existsPollUserVoted,
} from "../../../service/poll-service";

async function publishPollLifeCycle(pollResultId) {
  await closePollResult(pollResultId);
  const eventId = await findEventIdByPollResultId(pollResultId);
  if (!eventId) {
    console.warn(
      'Could not execute publishPollLifeCycle. Missing "eventId" or "pollResultId"',
      { pollResultId, eventId },
    );
    return;
  }
  pubsub.publish(POLL_LIFE_CYCLE, {
    eventId: eventId,
    state: "closed",
  });
}

export default {
  // todo refactor + document the logic here.
  createPollSubmitAnswer: async (_, { input }) => {
    const cloneAnswerObject = {};
    const pollResult = await findOneByPollId(input.pollId);
    if (!pollResult) {
      throw Error("Missing poll result record!");
    }
    const eventId = await findEventIdByPollResultId(pollResult.id);
    if (!pollResult) {
      throw Error("Missing related event record!");
    }
    input.pollResultId = pollResult.id; // fixme This is a quick fix because the following code relies on the now missing input.pollResultId.
    Object.assign(cloneAnswerObject, input);
    delete input.answerItemCount;
    delete input.answerItemLength;
    let leftAnswersDataSet = null;
    let allowToVote = true;
    if (
      cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount
    ) {
      leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);
      if (leftAnswersDataSet === null) {
        await publishPollLifeCycle(pollResult.id);
        return false;
      }
      allowToVote = await existsPollUserVoted(pollResult.id, input.eventUserId, input.multivote);
    }
    if (allowToVote) {
      await createPollUserIfNeeded(pollResult.id, input.eventUserId);
      const multivoteType = await getMultivoteType(eventId);
      if (multivoteType === 2 || input.multivote) {
        const eventUser = await findOneById(input.eventUserId);
        const voteCountFromUser = eventUser.voteAmount;
        let index;
        for (index = 1; index <= voteCountFromUser; ++index) {
          await insertPollSubmitAnswer(input);
        }
      } else {
        await insertPollSubmitAnswer(input);
      }
      leftAnswersDataSet = await findLeftAnswersCount(pollResult.id);
      if (
        cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount
      ) {
        // Again check if there are votes left.
        if (leftAnswersDataSet === null) {
          await publishPollLifeCycle(pollResult.id);
          return true;
        }
      }
    }

    if (leftAnswersDataSet) {
      // Notify the organizer about the current voted count.
      pubsub.publish(POLL_ANSWER_LIFE_CYCLE, {
        ...leftAnswersDataSet,
        eventId: eventId,
      });
    }
    return true;
  },
};
