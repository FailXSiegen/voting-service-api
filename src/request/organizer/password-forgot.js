import { findOneByUsername } from '../../repository/organizer-repository';
import { TOKEN_PURPOSE, issueOrganizerToken } from '../../lib/organizer/optin-util';
import mailer from '../../lib/email-util';
import { clientBaseUrl } from '../../server/security';

// SEC-11: Link nur aus CLIENT_BASE_URL. SEC-38: immer dieselbe Antwort (keine Enumeration).
export default async function requestPasswordForgot(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const username = req.body?.username;
    const organizer = typeof username === 'string' ? await findOneByUsername(username) : null;
    if (organizer) {
      const token = await issueOrganizerToken(organizer.id, TOKEN_PURPOSE.RESET);
      const host = clientBaseUrl();
      await mailer.sendMail({
        from: process.env.MAIL_DEFAULT_FROM,
        to: organizer.email,
        replyTo: process.env.MAIL_DEFAULT_FROM,
        subject: 'Passwort wiederherstellen für digitalwahl.org',
        template: 'request-new-password',
        ctx: {
          host,
          hash: token,
          link: `${host}/passwort-aendern/${token}`,
          organisation: process.env.MAIL_ORGANISATION,
          adminmail: process.env.MAIL_ADMIN_EMAIL,
          dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
          imprint: process.env.MAIL_LINK_IMPRINT,
        },
      });
    }
  } catch (error) {
    console.error('password-forgot:', error.message);
  }
  res.send(JSON.stringify({ success: true }));
}
