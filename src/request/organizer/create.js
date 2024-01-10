import {
  create,
  findOneByUsername,
} from "../../repository/organizer-repository";
import { generateAndSetOrganizerHash } from "../../lib/organizer/optin-util";
import mailer from "../../lib/email-util";

export default async function createOrganizer(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const origin = req.get("origin");
    const organizerArguments = req.body;
    if ((await findOneByUsername(organizerArguments.username)) !== null) {
      throw new Error(
        "organizer with the following username already exists: " +
          organizerArguments.username,
      );
    }
    const organizerId = await create({
      username: organizerArguments.username,
      email: organizerArguments.email,
      password: organizerArguments.password,
      publicName: organizerArguments.publicName,
      publicOrganisation: organizerArguments.publicOrganisation,
    });
    if (!organizerId) {
      throw new Error(
        "Could not create organizer with the following username: " +
          organizerArguments.username,
      );
    }

    const fakeOrganizer = { id: organizerId };
    const hash = await generateAndSetOrganizerHash(fakeOrganizer);
    await mailer.sendMail({
      from: process.env.MAIL_DEFAULT_FROM,
      to: organizerArguments.email,
      replyTo: process.env.MAIL_DEFAULT_FROM,
      subject: "Bestätigung der Registrierung für digitalwahl.org",
      template: "validate-email",
      ctx: {
        username: organizerArguments.username,
        publicname: organizerArguments.publicname,
        host: origin,
        hash: hash,
        link: origin + "/register/" + hash,
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
        error: error.message,
        success: false,
      }),
    );
  }
}
