import {
  TOKEN_PURPOSE,
  findOrganizerByToken,
  consumeTokenFields,
} from '../../lib/organizer/optin-util';
import { update } from '../../repository/organizer-repository';
import mailer from '../../lib/email-util';

// Opt-in-Link aus der Registrierungsmail. SEC-12: Antwort ohne Organizer-Datensatz.
export default async function validateOrganizerHashRequest(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const organizer = await findOrganizerByToken(req.body?.hash, TOKEN_PURPOSE.OPTIN);
    if (organizer === null) {
      throw new Error('The given hash is not valid.');
    }
    // Einmalig: Token verbrauchen, E-Mail bestätigen.
    await update({
      id: organizer.id,
      confirmedEmail: true,
      ...consumeTokenFields(TOKEN_PURPOSE.OPTIN),
    });
    if (organizer.confirmedEmail) {
      res.send(JSON.stringify({ success: true, alreadyConfirmed: true }));
      return;
    }
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
    res.send(JSON.stringify({ success: true }));
  } catch (error) {
    res.send(JSON.stringify({ error: 'The given hash is not valid.', success: false }));
  }
}
