import RecordNotFoundError from '../../errors/RecordNotFoundError';
import { findById } from '../../repository/event-repository';
import { toPublicEvent } from './public-event';

export default async function fetchEventById(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const { id } = req.params;
    if (!id) {
      throw new Error('Missing required parameter id.');
    }
    const event = /^\d+$/.test(id) ? await findById(id) : null;
    if (null === event) {
      throw new RecordNotFoundError('Event not found.');
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
