import {
  insertPollSubmitAnswer
} from '../../../repository/poll/poll-answer-repository'
import {
  findLeftAnswersCount,
  closePollResult
} from '../../../repository/poll/poll-result-repository'
import {
  create as createPollUserVoted,
  existInCurrentVote,
  allowToCreateNewVote
} from '../../../repository/poll/poll-user-voted-repository'
import { findEventIdByPollResultId } from '../../../repository/event-repository'

async function publishPollLifeCycle (pubsub, pollResultId) {
  await closePollResult(pollResultId)
  const eventId = await findEventIdByPollResultId(pollResultId)
  pubsub.publish('pollLifeCycle', {
    pollLifeCycle: {
      eventId: eventId,
      state: 'closed'
    }
  })
}

async function existsPollUserVoted (pollResultId, eventUserId) {
  const userExists = await existInCurrentVote(pollResultId, eventUserId)
  if (userExists === null) {
    await createPollUserVoted({ pollResultId: pollResultId, eventUserId: eventUserId, voteCycle: 1 })
    return true
  }
  return await allowToCreateNewVote(pollResultId, eventUserId)
}

export default {
  createPollSubmitAnswer: async (_, { input }, { pubsub }) => {
    const cloneAnswerObject = {}
    Object.assign(cloneAnswerObject, input)
    delete input.answerItemCount
    delete input.answerItemLength
    let leftAnswersDataSet = null
    let allowToVote = true
    if (cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount) {
      leftAnswersDataSet = await findLeftAnswersCount(input.pollResultId)
      if (leftAnswersDataSet === null) {
        await publishPollLifeCycle(pubsub, input.pollResultId)
        return false
      }
      allowToVote = await existsPollUserVoted(input.pollResultId, input.eventUserId, input.voteCycle)
    }
    if (allowToVote) {
      await insertPollSubmitAnswer(input)
      leftAnswersDataSet = await findLeftAnswersCount(input.pollResultId)
      if (cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount) {
        // Again check if there are votes left.
        if (leftAnswersDataSet === null) {
          await publishPollLifeCycle(pubsub, input.pollResultId)
          return true
        }
      }
    }
    const eventId = await findEventIdByPollResultId(input.pollResultId)
    // Notify the organizer about the current voted count.
    pubsub.publish('pollAnswerLifeCycle', {
      pollAnswerLifeCycle: {
        ...leftAnswersDataSet,
        eventId: eventId
      }
    })
    return true
  }
}
