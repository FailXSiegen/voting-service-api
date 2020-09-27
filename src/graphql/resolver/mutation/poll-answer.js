import {
  insertPollSubmitAnswer
} from '../../../repository/poll/poll-answer-repository'
import {
  resultAcceptsVotes,
  closePollResult
} from '../../../repository/poll/poll-result-repository'

async function publishPollLifeCycle (pubsub, pollResultId) {
  await closePollResult(pollResultId)
  pubsub.publish('pollLifeCycle', {
    pollLifeCycle: {
      state: 'closed'
    }
  })
}

export default {
  createPollSubmitAnswer: async (_, { input }, { pubsub }) => {
    // Check if there are votes left.
    let acceptVotes = await resultAcceptsVotes(input.pollResultId)
    if (!acceptVotes) {
      await publishPollLifeCycle(pubsub, input.pollResultId)
      return false
    }
    await insertPollSubmitAnswer(input)
    // Again check if there are votes left.
    acceptVotes = await resultAcceptsVotes(input.pollResultId)
    if (!acceptVotes) {
      await publishPollLifeCycle(pubsub, input.pollResultId)
    }
    return true
  }
}
