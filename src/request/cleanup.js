import { performEventCleanup } from '../services/event-cleanup.js';
import { clientBaseUrl } from '../server/security';

export default async function cleanUp(req, res) {
  res.setHeader('content-type', 'application/json');
  // SEC-11: Links in Mails nur aus CLIENT_BASE_URL, nicht aus dem Origin-Header.
  const result = await performEventCleanup(clientBaseUrl());
  res.send(JSON.stringify(result));
}
