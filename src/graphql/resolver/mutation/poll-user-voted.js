import { create as createPollUserVoted } from '../../../repository/poll/poll-user-voted-repository'

export default {
  createPollUserVoted: async (_, { input }, { pubsub }) => {
    return await createPollUserVoted(input)
  }
}
