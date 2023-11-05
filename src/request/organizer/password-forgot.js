import { findOneByUsername } from "../../repository/organizer-repository";
import { generateAndSetOrganizerHash } from "../../lib/organizer/optin-util";
import mailer from "../../lib/email-util";
import RecordNotFoundError from "../../errors/RecordNotFoundError";

export default async function requestPasswordForgot(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const origin = req.get("origin");
    const data = req.body;
    const organizer = await findOneByUsername(data.username);
    if (organizer === null) {
      throw new RecordNotFoundError(
        "organizer with the following username does not exist: " +
          data.username,
      );
    }
    const hash = await generateAndSetOrganizerHash(organizer);
    await mailer.sendMail({
      from: process.env.MAIL_DEFAULT_FROM,
      to: organizer.email,
      replyTo: process.env.MAIL_DEFAULT_FROM,
      subject: "Passwort wiederherstellen für digitalwahl.org",
      template: "request-new-password",
      ctx: {
        host: origin,
        hash: hash,
        link: origin + "/passwort-aendern/" + hash,
        organisation: process.env.MAIL_ORGANISATION,
        adminmail: process.env.MAIL_ADMIN_EMAIL,
        dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
        imprint: process.env.MAIL_LINK_IMPRINT,
      },
    });

    res.send(
      JSON.stringify({
        success: true,
      }),
    );
  } catch (error) {
    res.send(
      JSON.stringify({
        error: error,
        success: false,
      }),
    );
  }
}
