import { create as createPoll, findOneById } from '../../../repository/poll/poll-repository'
import { create as createPossibleAnswer } from '../../../repository/poll/poll-possible-answer-repository'

export default {
  createPoll: async (_, args, context) => {
    const pollId = await createPoll({
      title: args.input.title,
      eventId: args.input.eventId
    })
    for await (const answerInput of args.input.possibleAnswers) {
      await createPossibleAnswer({ pollId, content: answerInput.content })
    }
    return await findOneById(pollId)
  }
}
