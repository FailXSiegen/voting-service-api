import {
  insertPollSubmitAnswer
} from '../../../repository/poll/poll-answer-repository'
import {
  findLeftAnswersCount,
  closePollResult
} from '../../../repository/poll/poll-result-repository'

async function publishPollLifeCycle (pubsub, pollId) {
  await closePollResult(pollId)
  pubsub.publish('pollLifeCycle', {
    pollLifeCycle: {
      state: 'closed'
    }
  })
}

export default {
  createPollSubmitAnswer: async (_, { input }, { pubsub }) => {
    // Check if there are votes left.
    let leftAnswersDataSet = await findLeftAnswersCount(input.pollResultId)
    if (leftAnswersDataSet === null) {
      await publishPollLifeCycle(pubsub, input.pollResultId)
      return false
    }
    await insertPollSubmitAnswer(input)
    // Again check if there are votes left.
    leftAnswersDataSet = await findLeftAnswersCount(input.pollResultId)
    if (leftAnswersDataSet === null) {
      await publishPollLifeCycle(pubsub, input.pollResultId)
      return true
    }
    // Notify the organizer about the current voted count.
    pubsub.publish('pollAnswerLifeCycle', {
      pollAnswerLifeCycle: leftAnswersDataSet
    })
    return true
  }
}
