import { findOneBySlug } from '../../repository/event-repository';
import { toPublicEvent } from './public-event';

export default async function verifySlug(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const requestArguments = req.body;
    // SEC-13: nur Strings.
    if (typeof requestArguments?.slug !== 'string' || !requestArguments.slug) {
      throw new Error('Missing slug');
    }
    const event = await findOneBySlug(requestArguments.slug);
    if (event === null) {
      throw new Error('slug not found');
    }
    res.send(
      JSON.stringify({
        event: await toPublicEvent(event, req),
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
