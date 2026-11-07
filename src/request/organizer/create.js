import { create, findOneByUsername } from '../../repository/organizer-repository';
import { TOKEN_PURPOSE, issueOrganizerToken } from '../../lib/organizer/optin-util';
import { assertPasswordPolicy, clientBaseUrl } from '../../server/security';
import mailer from '../../lib/email-util';
import { verifyMosparo } from '../../lib/mosparo';
import SystemSettingsRepository from '../../repository/system-settings-repository';

export default async function createOrganizer(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const organizerArguments = req.body || {};
    // SEC-13: nur Strings.
    const fields = ['username', 'email', 'password', 'publicName', 'publicOrganisation'];
    if (fields.some((field) => typeof organizerArguments[field] !== 'string')) {
      throw new Error('Invalid input');
    }
    assertPasswordPolicy(organizerArguments.password);

    const captcha = await verifyMosparo(
      {
        formData: {
          username: organizerArguments.username,
          email: organizerArguments.email,
          publicName: organizerArguments.publicName,
          publicOrganisation: organizerArguments.publicOrganisation,
        },
        submitToken: organizerArguments.mosparoSubmitToken,
        validationToken: organizerArguments.mosparoValidationToken,
      },
      await SystemSettingsRepository.getSettings()
    );
    if (!captcha.success) {
      console.warn('[mosparo] signup rejected:', captcha.reason);
      throw new Error('Captcha verification failed');
    }

    if ((await findOneByUsername(organizerArguments.username)) !== null) {
      // Bewusst sichtbar (Nutzer muss einen anderen Namen wählen); Enumeration bremsen Captcha + Rate-Limit.
      throw new Error('Username already exists');
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
        'Could not create organizer with the following username: ' + organizerArguments.username
      );
    }

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

    res.send(
      JSON.stringify({
        success: true,
      })
    );
  } catch (error) {
    res.send(
      JSON.stringify({
        error: error.message,
        success: false,
      })
    );
  }
}
