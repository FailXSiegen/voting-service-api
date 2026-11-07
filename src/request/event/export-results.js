import {
  getPollOverview,
  getPollResults,
  getPollResultsDetails,
  getEventUsersWithVoteCount,
} from '../../repository/poll/poll-result-repository';
import {
  findEventUsersWithShortlinks,
  create as createShortlink,
} from '../../repository/event-user-shortlink-repository';
import { findById as findEventById } from '../../repository/event-repository';
import { generateUniqueShortCode } from '../../lib/shortlink-generator';
import * as fastcsv from 'fast-csv';

const EXPORTS = {
  pollOverview: getPollOverview,
  pollResults: getPollResults,
  pollResultsDetail: getPollResultsDetails,
  pollEventUsersVoted: getEventUsersWithVoteCount,
  eventUsersWithShortlinks: (eventId) => getEventUsersWithShortlinks(eventId),
};

// SEC-31: Zellen, die Excel/LibreOffice als Formel lesen würde, entschärfen.
const neutralizeFormula = (value) =>
  typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

export default async function downloadPollResultCsv(req, res) {
  try {
    const { eventId, exportType } = req.body || {};
    // SEC-31: Typ aus Whitelist, eventId nur numerisch – nichts davon landet in einem Dateipfad.
    if (!/^\d+$/.test(String(eventId)) || !Object.hasOwn(EXPORTS, exportType)) {
      res.status(400);
      return res.send(JSON.stringify({ error: 'Invalid export', success: false }));
    }
    const rows = (await EXPORTS[exportType](eventId)) || [];
    const safeRows = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, neutralizeFormula(value)]))
    );
    res.attachment(`${eventId}${exportType}.csv`);
    res.type('text/csv; charset=utf-8');
    // Direkt in die Antwort streamen, keine temporäre Datei.
    fastcsv.write(safeRows, { headers: true, delimiter: ';', quote: true }).pipe(res);
  } catch (error) {
    console.error('export-results:', error.message);
    res.status(500);
    res.send(JSON.stringify({ error: 'Export failed', success: false }));
  }
}

async function getEventUsersWithShortlinks(eventId) {
  const event = await findEventById(eventId);
  if (!event) {
    throw new Error('Event not found');
  }

  const eventUsers = await findEventUsersWithShortlinks(eventId);
  const baseUrl = process.env.CLIENT_BASE_URL || 'http://localhost:5173';

  // Generate shortlinks for users who don't have one
  const results = [];
  for (const user of eventUsers) {
    let shortCode = user.shortCode;

    // If user doesn't have a shortlink yet, create one
    if (!shortCode) {
      shortCode = await generateUniqueShortCode();
      await createShortlink(user.id, eventId, shortCode);
    }

    const shortlink = `${baseUrl}/s/${shortCode}`;

    results.push({
      'Public Name': user.publicName || '',
      Username: user.username,
      Stimmberechtigt: user.allowToVote ? 'Ja' : 'Nein',
      Stimmenanzahl: user.voteAmount,
      Shortlink: shortlink,
    });
  }

  return results;
}
