import mailer from "../email-util";

/**
 * @param {String} email
 * @param {String} token
 * @returns {Promise<void>}
 */
export function emailTokenToEventUser(to, token, event) {
  const tokenUrl = `${process.env.CLIENT_BASE_URL}/activate-user/${event.id}/${token}`;
  return mailer.sendMail({
    from: process.env.MAIL_DEFAULT_FROM,
    to,
    replyTo: process.env.MAIL_DEFAULT_FROM,
    subject: `Einladung zu "${event.title}"`,
    template: "new-event-user-auth-token",
    ctx: {
      tokenUrl,
      event,
      adminmail: process.env.MAIL_ADMIN_EMAIL,
      dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
      imprint: process.env.MAIL_LINK_IMPRINT,
    },
  });
}
