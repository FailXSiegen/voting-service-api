import { create as createPoll, findOneById } from '../../../repository/poll/poll-repository'
import { create as createPossibleAnswer } from '../../../repository/poll/poll-possible-answer-repository'

export default {
  createPoll: async (_, args, context) => {
    const poll = args.input
    const possibleAnswers = args.input.possibleAnswers
    delete poll.possibleAnswers
    const pollId = await createPoll(poll)
    for await (const answerInput of possibleAnswers) {
      await createPossibleAnswer({ pollId, content: answerInput.content })
    }
    return await findOneById(pollId)
  }
}
