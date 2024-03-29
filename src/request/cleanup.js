import {
  findAllExpired,
  markToDelete,
  findAllMarkedDelete,
  remove,
} from "../repository/event-repository";
import { findOneById } from "../repository/organizer-repository";
import mailer from "../lib/email-util";

export default async function cleanUp(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const origin = req.get("origin");
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

    res.send(
      JSON.stringify({
        success: true,
        expiredEvents: expiredEvents,
        eventsToRemove: eventsToRemove,
      }),
    );
  } catch (error) {
    res.send(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
    );
  }
}
