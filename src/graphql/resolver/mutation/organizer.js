import {
  findOneById,
  findOneByUsername,
  create,
  remove,
  update,
} from "../../../repository/organizer-repository";
import RecordNotFoundError from "../../../errors/RecordNotFoundError";
import { generateAndSetOrganizerHash } from "../../../lib/organizer/optin-util";
import mailer from "../../../lib/email-util";
// @TODO add two more layers (input validation & data enrichment)

export default {
  createOrganizer: async (_, args, context) => {
    const origin = context.request.headers.get("origin");
    const organizerArguments = args.input;
    
    // Check if username already exists
    const existingOrganizer = await findOneByUsername(organizerArguments.username);
    if (existingOrganizer) {
      throw new Error(
        "Organizer with the following username already exists: " +
          organizerArguments.username
      );
    }
    
    // Create the organizer
    const organizerId = await create({
      username: organizerArguments.username,
      email: organizerArguments.email,
      password: organizerArguments.password,
      publicName: organizerArguments.publicName,
      publicOrganisation: organizerArguments.publicOrganisation,
      confirmedEmail: organizerArguments.confirmedEmail || false,
      verified: organizerArguments.verified || false,
    });
    
    if (!organizerId) {
      throw new Error(
        "Could not create organizer with the following username: " +
          organizerArguments.username
      );
    }
    
    // Send verification email only if email is not pre-confirmed
    if (!organizerArguments.confirmedEmail) {
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
          publicname: organizerArguments.publicName,
          host: origin,
          hash: hash,
          link: origin + "/register/" + hash,
          organisation: process.env.MAIL_ORGANISATION,
          adminmail: process.env.MAIL_ADMIN_EMAIL,
          dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
          imprint: process.env.MAIL_LINK_IMPRINT,
        },
      });
    }
    
    // Return the created organizer
    const createdOrganizer = await findOneById(organizerId);
    return createdOrganizer;
  },
  updateOrganizer: async (_, args, context) => {
    const existingUser = await findOneById(args.input.id);
    const origin = context.request.headers.get("origin");
    if (!existingUser) {
      throw new RecordNotFoundError();
    }
    await update(args.input);
    const updatedUser = await findOneById(args.input.id);
    if (updatedUser.verified) {
      await mailer.sendMail({
        from: process.env.MAIL_DEFAULT_FROM,
        to: updatedUser.email,
        replyTo: process.env.MAIL_DEFAULT_FROM,
        subject: "Aktualisierung des Kontos für digitalwahl.org",
        template: "organizer-verified",
        ctx: {
          username: updatedUser.username,
          publicname: updatedUser.publicname,
          host: origin,
          organisation: process.env.MAIL_ORGANISATION,
          adminmail: process.env.MAIL_ADMIN_EMAIL,
          dataprotection: process.env.MAIL_LINK_DATAPROTECTION,
          imprint: process.env.MAIL_LINK_IMPRINT,
        },
      });
    }
    return updatedUser;
  },
  deleteOrganizer: async (_, args) => {
    const existingUser = await findOneById(args.id);
    if (!existingUser) {
      throw new RecordNotFoundError();
    }
    return await remove(parseInt(args.id));
  },
};
