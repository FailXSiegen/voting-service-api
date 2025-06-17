import {
  findAllExpired,
  markToDelete,
  findAllMarkedDelete,
  remove,
} from "../repository/event-repository.js";
import { findOneById } from "../repository/organizer-repository.js";
import mailer from "../lib/email-util.js";

/**
 * Performs cleanup of expired events
 * @param {string} origin - The origin URL for email templates (optional)
 * @returns {Promise<{success: boolean, expiredEvents: Array, eventsToRemove: Array, error?: string}>}
 */
export async function performEventCleanup(origin = process.env.APP_URL || "https://digitalwahl.org") {
  try {
    const expiredEvents = await findAllExpired();
    if (expiredEvents !== null) {
      for (const event of expiredEvents) {
        const organizer = await findOneById(event.organizerId);
        await mailer.sendMail({
          from: process.env.MAIL_DEFAULT_FROM,
          to: organizer.email,
          replyTo: process.env.MAIL_DEFAULT_FROM,
          subject:
            'Löschung Veranstaltung "' + event.title + '" - digitalwahl.org',
          template: "delete-planned",
          ctx: {
            username: organizer.username,
            eventname: event.title,
            host: origin,
            organisation: process.env.MAIL_ORGANISATION,
            adminmail: process.env.MAIL_ADMIN_EMAIL,
            dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
            imprint: process.env.MAIL_LINK_IMPRINT,
          },
        });
      }
    }
    
    await markToDelete();
    const eventsToRemove = await findAllMarkedDelete();
    if (eventsToRemove !== null) {
      for (const event of eventsToRemove) {
        await remove(event.organizerId, event.id);
      }
    }

    return {
      success: true,
      expiredEvents: expiredEvents,
      eventsToRemove: eventsToRemove,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}