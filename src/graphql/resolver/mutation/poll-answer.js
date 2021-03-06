import {
  insertPollSubmitAnswer
} from '../../../repository/poll/poll-answer-repository'
import {
  findLeftAnswersCount,
  updatePollResultMaxVotes,
  closePollResult
} from '../../../repository/poll/poll-result-repository'
import {
  createPollUserVoted,
  existInCurrentVote,
  allowToCreateNewVote
} from '../../../repository/poll/poll-user-voted-repository'
import {
  createPollUserWithPollResultId,
  existAsPollUserInCurrentVote
} from '../../../repository/poll/poll-user-repository'
import { findEventIdByPollResultId, getMultivoteType } from '../../../repository/event-repository'
import { findOneById } from '../../../repository/event-user-repository'

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
    await createPollUserVoted(pollResultId, eventUserId, 1)
    return true
  }
  return await allowToCreateNewVote(pollResultId, eventUserId)
}

async function existsPollUser (pollResultId, eventUserId) {
  const userExists = await existAsPollUserInCurrentVote(pollResultId, eventUserId)
  if (userExists === null) {
    const result = await createPollUserWithPollResultId(pollResultId, eventUserId)
    if (result) {
      await updatePollResultMaxVotes(pollResultId, eventUserId)
    }
    return result
  }
  return true
}

export default {
  createPollSubmitAnswer: async (_, { input }, { pubsub }) => {
    const cloneAnswerObject = {}
    const eventId = await findEventIdByPollResultId(input.pollResultId)
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
      await existsPollUser(input.pollResultId, input.eventUserId)
      const multivoteType = await getMultivoteType(eventId)
      if (multivoteType === 2 || input.multivote) {
        const eventUser = await findOneById(input.eventUserId)
        const voteCountFromUser = eventUser.voteAmount
        var index
        for (index = 1; index <= voteCountFromUser; ++index) {
          await insertPollSubmitAnswer(input)
        }
      } else {
        await insertPollSubmitAnswer(input)
      }
      leftAnswersDataSet = await findLeftAnswersCount(input.pollResultId)
      if (cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount) {
        // Again check if there are votes left.
        if (leftAnswersDataSet === null) {
          await publishPollLifeCycle(pubsub, input.pollResultId)
          return true
        }
      }
    }

    if (leftAnswersDataSet) {
      // Notify the organizer about the current voted count.
      pubsub.publish('pollAnswerLifeCycle', {
        pollAnswerLifeCycle: {
          ...leftAnswersDataSet,
          eventId: eventId
        }
      })
    }
    return true
  }
}
