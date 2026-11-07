import { update } from '../../repository/organizer-repository';
import mailer from '../../lib/email-util';
import {
  TOKEN_PURPOSE,
  findOrganizerByToken,
  consumeTokenFields,
} from '../../lib/organizer/optin-util';
import { assertPasswordPolicy } from '../../server/security';
import { query } from '../../lib/database';

export default async function updateOrganizerPassword(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const { password, passwordRepeat, hash } = req.body || {};

    if (password !== passwordRepeat) {
      throw new Error('The fields "password" and "passwordRepeat" must be the same.');
    }
    assertPasswordPolicy(password);

    // SEC-09/10: nur ein gültiges, nicht abgelaufenes Reset-Token.
    const organizer = await findOrganizerByToken(hash, TOKEN_PURPOSE.RESET);
    if (organizer === null) {
      throw new Error('The given hash is not valid.');
    }

    // Ein Reset über die Mail bestätigt auch die Adresse (offene Opt-ins laufen hierüber).
    const confirmsEmail = !organizer.confirmedEmail;
    await update({
      id: organizer.id,
      confirmedEmail: true,
      password,
      ...consumeTokenFields(TOKEN_PURPOSE.RESET),
    });
    // Bestehende Sitzungen beenden.
    await query('DELETE FROM jwt_refresh_token WHERE organizer_id = ?', [organizer.id]);

    if (confirmsEmail) {
      await mailer.sendMail({
        from: process.env.MAIL_DEFAULT_FROM,
        to: process.env.MAIL_ADMIN_EMAIL,
        subject: 'Validierung einer E-Mail Adresse',
        template: 'validate-complete',
        ctx: {
          name: organizer.publicName,
          organisation: organizer.publicOrganisation,
          email: organizer.email,
          id: organizer.id,
        },
      });
    }

    res.send(JSON.stringify({ success: true }));
  } catch (error) {
    res.send(JSON.stringify({ error: error.message, success: false }));
  }
}
