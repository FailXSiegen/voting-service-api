import { create } from '../../repository/organizer-repository'

export default async function createOrganizer (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const requestArguments = req.body
    if (!requestArguments.username) {
      throw new Error('Missing username')
    }
    const organizer = await create(req)
    if (!organizer) {
      throw new Error('Could not create organizer with the following username: ' + req.username)
    }
    res.send(JSON.stringify({
      organizer,
      success: true
    }))
  } catch (error) {
    res.send(JSON.stringify({
      error: error.message,
      success: false
    }))
  }
}
