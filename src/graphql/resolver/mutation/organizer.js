import {
  findOneById,
  remove,
  update,
} from "../../../repository/organizer-repository";
import RecordNotFoundError from "../../../errors/RecordNotFoundError";
import mailer from "../../../lib/email-util";
// @TODO add two more layers (input validation & data enrichment)

export default {
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
