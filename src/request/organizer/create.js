import { create, findOneByUsername } from '../../repository/organizer-repository'

export default async function createOrganizer (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const data = req.body
    if (findOneByUsername(data.username) === null) {
      throw new Error('Could not create organizer with the following username: ' + data.username)
    }
    const organizer = await create(data)
    if (!organizer) {
      throw new Error('Could not create organizer with the following username: ' + data.username)
    }
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
