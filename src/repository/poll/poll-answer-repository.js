import { query } from './../../lib/database';

// Stimmen werden ausschließlich über submitBallots() (service/poll-service.js) geschrieben.
// Geheime Stimmen haben zufällige IDs, die Reihenfolge erlaubt also keine Zuordnung (SEC-23).
export async function findByPollResultId(pollResultId) {
  const result = await query('SELECT * FROM poll_answer WHERE poll_result_id = ?', [pollResultId]);
  return Array.isArray(result) ? result : [];
}
