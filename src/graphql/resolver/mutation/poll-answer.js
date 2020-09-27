import {
  insertPollSubmitAnswer
} from '../../../repository/poll/poll-answer-repository'

export default {
  createPollSubmitAnswer: async (_, args, context) => {
    return await insertPollSubmitAnswer(args.input)
  }
}
