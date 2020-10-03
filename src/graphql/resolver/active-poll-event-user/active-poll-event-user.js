import { findOneById } from '../../../repository/poll/poll-repository'

export default {
  poll: async ({ poll }) => {
    return await findOneById(poll)
  }
}
