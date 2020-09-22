import { create as createPoll, findOneById } from '../../../repository/poll/poll-repository'
import { create as createPossibleAnswer } from '../../../repository/poll/poll-possible-answer-repository'

export default {
  createPoll: async (_, args, { pubsub }) => {
    const poll = args.input
    const possibleAnswers = args.input.possibleAnswers
    delete poll.possibleAnswers
    const pollId = await createPoll(poll)
    for await (const answerInput of possibleAnswers) {
      await createPossibleAnswer({ pollId, content: answerInput.content })
    }
    const pollRecord = await findOneById(pollId)
    if (args.instantStart === true) {
      pubsub.publish('pollLifeCycle', {
        pollLifeCycle: {
          state: 'new',
          poll: pollRecord
        }
      })
    }
    return pollRecord
  }
}
