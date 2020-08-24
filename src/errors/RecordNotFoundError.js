import { createError } from 'apollo-errors'

const RecordNotFoundError = createError('RecordNotFoundError', {
  message: 'Could not find the requested record.'
})

export default RecordNotFoundError
