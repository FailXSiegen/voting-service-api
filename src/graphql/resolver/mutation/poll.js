import { create as createPoll, findOneById } from '../../../repository/poll/poll-repository'
import { create as createPossibleAnswer } from '../../../repository/poll/poll-possible-answer-repository'

export default {
  createPoll: async (_, args, context) => {
    const pollId = await createPoll({
      title: args.input.title,
      eventId: args.eventId
    })
    for await (const content of args.input.possibleAnswers) {
      await createPossibleAnswer({ pollId, content })
    }
    return await findOneById(pollId)
  }
}
