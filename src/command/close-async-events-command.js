import {
  findAllUnfinishedPassedAsyncEvents,
  update as updateEvent,
} from "../repository/event-repository";
import { findOneById as findOneOrganizerById } from "../repository/organizer-repository";
import { closeAllPollResultsByEventId } from "../repository/poll/poll-result-repository";
import mailer from "../lib/email-util";

export default {
  name: "Close async events (every 15 min)",
  interval: "*/15 * * * *",
  active: true,
  execute: async () => {
    console.info("[cron] Check for async events to close");
    try {
      await processEvents((await findAllUnfinishedPassedAsyncEvents()) ?? []);
    } catch (error) {
      console.error("[cron] " + error);
    }
  },
  options: {},
};

async function processEvents(events) {
  if (!events.length > 0) {
    return;
  }
  for await (const event of events) {
    await updateEvent({
      id: event.id,
      finished: true,
    });
    await closeAllPollResultsByEventId(event.id);
    await notifyOrganizer(event);
  }
}

async function notifyOrganizer(event) {
  const organizer = await findOneOrganizerById(event.organizerId);
  if (!organizer) {
    throw new Error(`Could not fetch organizer with id ${event.organizerId}.`);
  }

  await mailer.sendMail({
    from: process.env.MAIL_DEFAULT_FROM,
    to: organizer.email,
    replyTo: process.env.MAIL_DEFAULT_FROM,
    subject: `Veranstaltung "${event.title}" beendet`,
    template: "async-event-closed",
    ctx: {
      event,
      organizer,
      adminmail: process.env.MAIL_ADMIN_EMAIL,
      dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
      imprint: process.env.MAIL_LINK_IMPRINT,
    },
  });
}
