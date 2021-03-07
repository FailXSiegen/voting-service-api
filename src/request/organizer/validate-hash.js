import { validate } from '../../lib/organizer/optin-util'
import { findOneByHash, update } from '../../repository/organizer-repository'
import mailer from '../../lib/email-util'

export default async function validateOrganizerHashRequest (req, res) {
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

    if (organizer.confirmedEmail) {
      res.send(JSON.stringify({
        success: await validate(requestArguments.hash),
        organizer: organizer
      }))
      return
    }
    // Update confirmed_email field of target organizer record.
    await update({
      id: organizer.id,
      confirmedEmail: true
    })
    await mailer.sendMail({
      from: process.env.MAIL_DEFAULT_FROM,
      to: process.env.MAIL_ADMIN_EMAIL,
      subject: 'Validierung einer E-Mail Adresse',
      template: 'validate-complete',
      ctx: {
        name: organizer.publicName,
        organisation: organizer.publicOrganisation,
        email: organizer.email,
        id: organizer.id
      }
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
