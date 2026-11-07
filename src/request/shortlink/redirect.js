import { findOneByShortCode } from '../../repository/event-user-shortlink-repository';
import { clientBaseUrl } from '../../server/security';

// SEC-40: Legacy-Redirect /s/:code. Keine Personendaten (username/publicname) mehr in die URL –
// die Client-Route /s/:code löst den Code selbst über /api/shortlink/:code auf.
export default async function redirectShortlink(req, res) {
  try {
    const { shortCode } = req.params;
    const shortlink = /^[a-z0-9]{4,32}$/.test(shortCode)
      ? await findOneByShortCode(shortCode)
      : null;
    if (!shortlink) {
      return res.status(404).send('Shortlink not found');
    }
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.redirect(302, `${clientBaseUrl()}/s/${shortCode}`);
  } catch (error) {
    console.error('Shortlink redirect error:', error.message);
    res.status(500).send('Internal server error');
  }
}
