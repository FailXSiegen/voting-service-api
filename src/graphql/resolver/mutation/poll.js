import { create as createPoll, remove as removePoll, findOneById } from '../../../repository/poll/poll-repository'
import { create as createPossibleAnswer } from '../../../repository/poll/poll-possible-answer-repository'
import { create as createPollResult } from '../../../repository/poll/poll-result-repository'
import { create as createPollUser } from '../../../repository/poll/poll-user-repository'
import { findOnlineEventUserByEventId } from '../../../repository/event-user-repository'

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
      const pollResultId = await createPollDependencies(pollRecord)
      if (pollResultId) {
        pubsub.publish('pollLifeCycle', {
          pollLifeCycle: {
            state: 'new',
            poll: pollRecord,
            pollResultId: pollResultId
          }
        })
      }
    }
    return pollRecord
  },
  startPoll: async (_, args, { pubsub }) => {
    const pollRecord = await findOneById(args.id)
    const pollResultId = await createPollDependencies(pollRecord)
    if (pollResultId) {
      pubsub.publish('pollLifeCycle', {
        pollLifeCycle: {
          state: 'new',
          poll: pollRecord,
          pollResultId: pollResultId
        }
      })
    }
    return pollRecord
  },
  stopPoll: async (_, args, { pubsub }) => {
    // @Todo set state to published poll
  },
  removePoll: async (_, args, context) => {
    return await removePoll(args.id)
  }

}

async function createPollDependencies (pollRecord) {
  let maxPollVotes = 0
  const onlineEventUsers = await findOnlineEventUserByEventId(pollRecord.eventId)
  for await (const onlineEventUser of onlineEventUsers) {
    maxPollVotes += onlineEventUser.voteAmount
    const pollUser = {
      eventUserId: onlineEventUser.id,
      publicName: onlineEventUser.publicName,
      pollId: pollRecord.id
    }
    await createPollUser(pollUser)
  }
  const pollResult = { pollId: pollRecord.id, type: pollRecord.type, maxVotes: maxPollVotes }
  return await createPollResult(pollResult)
}
