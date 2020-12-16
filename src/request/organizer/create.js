import { create, findOneByUsername } from '../../repository/organizer-repository'
import { generateAndSetOrganizerHash } from '../../lib/organizer/optin-util'
import mailer from '../../lib/email-util'

export default async function createOrganizer (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const data = req.body
    if (findOneByUsername(data.username) === null) {
      throw new Error('Could not create organizer with the following username: ' + data.username)
    }
    const organizerId = await create(data)
    if (!organizerId) {
      throw new Error('Could not create organizer with the following username: ' + data.username)
    }

    const fakeOrganizer = {id: organizerId}
    const hash = await generateAndSetOrganizerHash(fakeOrganizer)
    await mailer.sendMail({
      from: process.env.MAIL_DEFAULT_FROM,
      to: data.email,
      subject: 'E-Mail Bestätigung - digitalwahl.org',
      template: "validate-email",
      ctx: {
          username: data.username,
          publicname: data.publicname,
          host: process.env.CORS_ORIGIN,
          hash: hash,
          link: process.env.CORS_ORIGIN +'/validate/' + hash,
          dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
          imprint :process.env.MAIL_LINK_IMPRINT
      }
    })
    
    res.send(JSON.stringify({
      success: true
    }))
  } catch (error) {
    res.send(JSON.stringify({
      error: error.message,
      success: false
    }))
  }
}
