import { findOneBySlug } from '../../repository/event-repository'

export default async function verifySlug (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const requestArguments = req.body
    if (!requestArguments.slug) {
      throw new Error('Missing slug')
    }
    const event = await findOneBySlug(requestArguments.slug)
    if (event === null) {
      throw new Error('slug not found')
    }
    res.send(JSON.stringify({
      event,
      success: true
    }))
  } catch (error) {
    res.send(JSON.stringify({
      error: error.message,
      success: false
    }))
  }
}
