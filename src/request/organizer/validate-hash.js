import { validate } from '../../lib/organizer/optin-util'
import { findOneByHash, update } from '../../repository/organizer-repository'

export default async function verifySlug (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const requestArguments = req.body
    if (!requestArguments.hash) {
      throw new Error('Missing hash parameter')
    }
    const isValid = await validate(requestArguments.hash)
    if (!isValid) {
      throw new Error('The given hash is not valid.')
    }
    const organizer = await findOneByHash(requestArguments.hash)
    if (organizer === null) {
      throw new Error('Organizer with hash "' + requestArguments.hash + '" not found.')
    }

    // Update confirmed_email field of target organizer record.
    await update({
      id: organizer.id,
      email: organizer.email,
      confirmedEmail: true
    })
    res.send(JSON.stringify({
      success: await validate(requestArguments.hash)
    }))
  } catch (error) {
    res.send(JSON.stringify({
      error: error.message,
      success: false
    }))
  }
}
