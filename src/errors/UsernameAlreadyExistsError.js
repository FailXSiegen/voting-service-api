import { createError } from 'apollo-errors'

const UsernameAlreadyExistsError = createError('UsernameAlreadyExistsError', {
  message: 'The provided username already exists.'
})

export default UsernameAlreadyExistsError
