import { typeConverter } from '../queries/poll'
import { findByPollId } from '../../../repository/poll/poll-possible-answer-repository'

export default {
  type: ({ type }) => {
    return typeConverter(type)
  },
  possibleAnswers: async ({ id }) => {
    return await findByPollId(id)
  }
}
