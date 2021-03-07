import { update, findOneById } from '../../repository/organizer-repository'

export default async function updateOrganizerPassword (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const data = req.body
    if (await findOneById(data.id) === null) {
      throw new Error('organizer with the following id did not exist: ' + data.id)
    }
    await update(data)
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
