import { findOneById } from '../../../repository/event-user-repository';
import { create, findOneByEventUserId } from '../../../repository/event-user-shortlink-repository';
import { generateUniqueShortCode } from '../../../lib/shortlink-generator';

// Liefert den Login-Shortcode eines Teilnehmers (legt ihn bei Bedarf an).
// Nur für den Organizer des Events (authorize.js, OWNED_RECORDS), damit "Link kopieren"
// wieder einen funktionierenden Einmal-Login-Link erzeugt (MAGIC-1).
export default {
  createEventUserShortlink: async (_, { eventUserId }) => {
    const existing = await findOneByEventUserId(eventUserId);
    if (existing) {
      return existing.shortCode;
    }
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      throw new Error('Event user not found.');
    }
    const shortCode = await generateUniqueShortCode();
    await create(eventUser.id, eventUser.eventId, shortCode);
    return shortCode;
  },
};
