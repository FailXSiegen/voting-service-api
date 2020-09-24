import { findById } from '../../../repository/poll/poll-user-repository'

export default {
  pollUser: async ({ pollUserId }) => {
    return await findById(pollUserId)
  }
}
