import { update, findOneByHash } from "../../repository/organizer-repository";
import mailer from "../../lib/email-util";

export default async function updateOrganizerPassword(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const { password, passwordRepeat, hash } = req.body;

    // Validate passwords.
    if (password !== passwordRepeat) {
      throw new Error(
        'The fields "password" and "passwordRepeat" must be the same.',
      );
    }

    // Validate the given hash by fetching the organizer record based on it.
    const organizer = await findOneByHash(hash);
    if (organizer === null) {
      throw new Error(
        'The given hash is not valid. Organizer with hash "' +
          hash +
          '" not found.',
      );
    }

    // Update organizer record.
    organizer.password = password;
    if (!organizer.confirmedEmail) {
      // Confirm the email of the organizer, if it is yet not confirmed.
      organizer.confirmedEmail = true;

      // Notify organizer about the email confirmation.
      await mailer.sendMail({
        from: process.env.MAIL_DEFAULT_FROM,
        to: process.env.MAIL_ADMIN_EMAIL,
        subject: "Validierung einer E-Mail Adresse",
        template: "validate-complete",
        ctx: {
          name: organizer.publicName,
          organisation: organizer.publicOrganisation,
          email: organizer.email,
          id: organizer.id,
        },
      });
    }

    // Update changed organizer fields.
    await update({
      id: organizer.id,
      confirmedEmail: organizer.confirmedEmail,
      password: organizer.password,
      hash: "",
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
