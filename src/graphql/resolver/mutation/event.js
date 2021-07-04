import { create, update, findOneBySlug, remove } from '../../../repository/event-repository'
import SlugAlreadyExistsError
  from '../../../errors/event/SlugAlreadyExistsError'

export default {
  createEvent: async (_, { input }) => {
    const existingEvent = await findOneBySlug(input.slug)
    if (existingEvent) {
      throw new SlugAlreadyExistsError()
    }
    if (input.meeting) {
      input = convertMeetingInput(input)
    }
    await create(input)
    return await findOneBySlug(input.slug)
  },
  updateEvent: async (_, { input }) => {
    const existingEvent = await findOneBySlug(input.slug)
    if (existingEvent && parseInt(existingEvent.id) !== parseInt(input.id)) {
      throw new SlugAlreadyExistsError()
    }
    if (input.meeting) {
      input = convertMeetingInput(input)
    }
    await update(input)
    return await findOneBySlug(input.slug)
  },
  removeEvent: async (_, { organizerId, id }) => {
    return await remove(organizerId, id)
  }
}

function convertMeetingInput (input) {
  const meetingId = input.meeting.meetingId
  const meetingType = input.meeting.meetingType
  // Validate input.
  if (!meetingId || !meetingType) {
    delete input.meeting
    return input
  }
  delete input.meeting
  input.meetingId = meetingId
  input.meetingType = meetingType
  return input
}
