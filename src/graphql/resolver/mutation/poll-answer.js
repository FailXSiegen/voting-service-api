import {
  insertPollSubmitAnswer
} from '../../../repository/poll/poll-answer-repository'
import {
  findLeftAnswersCount,
  closePollResult
} from '../../../repository/poll/poll-result-repository'
import {
  create as createPollUserVoted,
  existInCurrentVote
} from '../../../repository/poll/poll-user-voted-repository'

async function publishPollLifeCycle (pubsub, pollId) {
  await closePollResult(pollId)
  pubsub.publish('pollLifeCycle', {
    pollLifeCycle: {
      state: 'closed'
    }
  })
}

async function existsPollUserVoted (pollResultId, eventUserId, voteCycle) {
  const userExists = await existInCurrentVote(pollResultId, eventUserId, voteCycle)
  if (userExists === null) {
    await createPollUserVoted({ pollResultId: pollResultId, eventUserId: eventUserId, voteCycle: voteCycle })
  }
}

export default {
  createPollSubmitAnswer: async (_, { input }, { pubsub }) => {
    const cloneAnswerObject = {}
    Object.assign(cloneAnswerObject, input)
    console.log(cloneAnswerObject.answerItemCount)
    console.log(cloneAnswerObject.answerItemLength)
    delete input.answerItemCount
    delete input.answerItemLength
    let leftAnswersDataSet = null
    if (cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount) {
      leftAnswersDataSet = await findLeftAnswersCount(input.pollResultId)
      if (leftAnswersDataSet === null) {
        await publishPollLifeCycle(pubsub, input.pollResultId)
        return false
      }
      await existsPollUserVoted(input.pollResultId, input.eventUserId, input.voteCycle)
    }
    await insertPollSubmitAnswer(input)
    leftAnswersDataSet = await findLeftAnswersCount(input.pollResultId)
    if (cloneAnswerObject.answerItemLength === cloneAnswerObject.answerItemCount) {
      // Again check if there are votes left.
      if (leftAnswersDataSet === null) {
        await publishPollLifeCycle(pubsub, input.pollResultId)
        return true
      }
    }
    // Notify the organizer about the current voted count.
    pubsub.publish('pollAnswerLifeCycle', {
      pollAnswerLifeCycle: leftAnswersDataSet
    })
    return true
  }
}
