import { getVoteAdjustmentsByEventId, convertLogsToTXT } from '../../lib/vote-adjustment-logger.js';

export default async function downloadVoteAdjustmentsCsv(req, res) {
  try {
    const { eventId } = req.params;

    if (!/^\d+$/.test(String(eventId))) {
      return res.status(400).json({
        error: 'Event ID ist erforderlich',
        success: false,
      });
    }

    // Hole alle Vote-Anpassungen für das Event
    const logs = await getVoteAdjustmentsByEventId(eventId);

    if (!logs || logs.length === 0) {
      return res.status(404).json({
        error: 'Keine Stimmen-Anpassungen für dieses Event gefunden',
        success: false,
      });
    }

    // Konvertiere zu TXT
    const txtContent = convertLogsToTXT(logs);

    // SEC-31: direkt ausliefern, keine temporäre Datei.
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.attachment(`vote-adjustments-event-${Number(eventId)}-${timestamp}.txt`);
    res.type('text/plain; charset=utf-8');
    res.send(txtContent);
  } catch (error) {
    console.error('Fehler beim Export der Vote-Anpassungen:', error);
    res.status(500).json({
      error: 'Export failed',
      success: false,
    });
  }
}
