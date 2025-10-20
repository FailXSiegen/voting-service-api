import { getVoteAdjustmentsByEventId, convertLogsToTXT } from "../../lib/vote-adjustment-logger.js";
import * as fs from "fs";
import path from "path";

export default async function downloadVoteAdjustmentsCsv(req, res) {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        error: "Event ID ist erforderlich",
        success: false,
      });
    }

    // Hole alle Vote-Anpassungen für das Event
    const logs = await getVoteAdjustmentsByEventId(eventId);

    if (!logs || logs.length === 0) {
      return res.status(404).json({
        error: "Keine Stimmen-Anpassungen für dieses Event gefunden",
        success: false,
      });
    }

    // Konvertiere zu TXT
    const txtContent = convertLogsToTXT(logs);

    // Generiere Dateinamen
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vote-adjustments-event-${eventId}-${timestamp}.txt`;
    const tempPath = path.join(__dirname, "../../../", filename);

    // Schreibe TXT-Datei
    fs.writeFileSync(tempPath, txtContent, 'utf8');

    // Sende Datei zum Download und lösche sie danach
    res.download(tempPath, filename, (err) => {
      // Lösche temporäre Datei nach dem Download
      fs.unlink(tempPath, (unlinkErr) => {
        if (unlinkErr) {
          console.error('Fehler beim Löschen der temporären Datei:', unlinkErr);
        }
      });

      if (err) {
        console.error('Fehler beim Download:', err);
      }
    });

  } catch (error) {
    console.error('Fehler beim Export der Vote-Anpassungen:', error);
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
}