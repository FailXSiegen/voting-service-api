import {
  findOneById,
  findOneByUsername,
  create,
  remove,
  update,
} from '../../../repository/organizer-repository';
import RecordNotFoundError from '../../../errors/RecordNotFoundError';
import { TOKEN_PURPOSE, issueOrganizerToken } from '../../../lib/organizer/optin-util';
import mailer from '../../../lib/email-util';
import { verify } from '../../../lib/crypto';
import { query } from '../../../lib/database';
import { assertPasswordPolicy, clientBaseUrl } from '../../../server/security';
// @TODO add two more layers (input validation & data enrichment)

// SEC-39: Eigene E-Mail/Passwort nur mit aktuellem Passwort ändern – auch als Super-Admin.
async function assertCurrentPassword(input, existingUser, context) {
  const isSelf = Number(context?.user?.id) === Number(existingUser.id);
  const changesCredentials =
    (input.password !== undefined && input.password !== null) ||
    (typeof input.email === 'string' && input.email !== existingUser.email);
  if (process.env.ENABLE_JWT !== '1' || !isSelf || !changesCredentials) return;
  const valid =
    typeof input.currentPassword === 'string' &&
    (await verify(input.currentPassword, existingUser.password));
  if (!valid) {
    throw new Error('Current password is invalid.');
  }
}

export default {
  createOrganizer: async (_, args) => {
    const organizerArguments = args.input;
    assertPasswordPolicy(organizerArguments.password);

    // Check if username already exists
    const existingOrganizer = await findOneByUsername(organizerArguments.username);
    if (existingOrganizer) {
      throw new Error(
        'Organizer with the following username already exists: ' + organizerArguments.username
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
        'Could not create organizer with the following username: ' + organizerArguments.username
      );
    }

    // Send verification email only if email is not pre-confirmed
    if (!organizerArguments.confirmedEmail) {
      // SEC-10/11: zufälliges Opt-in-Token, Link nur aus CLIENT_BASE_URL.
      const hash = await issueOrganizerToken(organizerId, TOKEN_PURPOSE.OPTIN);
      const origin = clientBaseUrl();
      await mailer.sendMail({
        from: process.env.MAIL_DEFAULT_FROM,
        to: organizerArguments.email,
        replyTo: process.env.MAIL_DEFAULT_FROM,
        subject: 'Bestätigung der Registrierung für digitalwahl.org',
        template: 'validate-email',
        ctx: {
          username: organizerArguments.username,
          publicname: organizerArguments.publicName,
          host: origin,
          hash: hash,
          link: origin + '/register/' + hash,
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
    if (!existingUser) {
      throw new RecordNotFoundError();
    }
    const input = { ...args.input };
    delete input.currentPassword;
    await assertCurrentPassword(args.input, existingUser, context);
    if (input.password !== undefined && input.password !== null) {
      assertPasswordPolicy(input.password);
    }
    await update(input);
    if (input.password) {
      // Andere Sitzungen nach Passwortwechsel beenden, die eigene (eigenes Konto) behalten.
      const keepOwn =
        context?.user?.type === 'organizer' && Number(context.user.id) === Number(existingUser.id);
      if (keepOwn && context.refreshToken) {
        await query('DELETE FROM jwt_refresh_token WHERE organizer_id = ? AND token <> ?', [
          existingUser.id,
          context.refreshToken,
        ]);
      } else {
        await query('DELETE FROM jwt_refresh_token WHERE organizer_id = ?', [existingUser.id]);
      }
    }
    const updatedUser = await findOneById(input.id);
    if (updatedUser.verified) {
      await mailer.sendMail({
        from: process.env.MAIL_DEFAULT_FROM,
        to: updatedUser.email,
        replyTo: process.env.MAIL_DEFAULT_FROM,
        subject: 'Aktualisierung des Kontos für digitalwahl.org',
        template: 'organizer-verified',
        ctx: {
          username: updatedUser.username,
          publicname: updatedUser.publicname,
          host: clientBaseUrl(),
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
