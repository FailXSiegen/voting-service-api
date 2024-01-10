import {
  getPollOverview,
  getPollResults,
  getPollResultsDetails,
  getEventUsersWithVoteCount,
} from "../../repository/poll/poll-result-repository";
import * as fs from "fs";
import * as fastcsv from "fast-csv";
import path from "path";

export default async function downloadPollResultCsv(req, res) {
  try {
    const data = req.body;
    const generatedfilename = data.eventId + data.exportType + ".csv";
    const relPath = generatedfilename;
    const absPath = path.join(__dirname, "../../../", generatedfilename);
    let responseData = "";
    switch (data.exportType) {
      case "pollOverview":
        responseData = await getPollOverview(data.eventId);
        break;
      case "pollResults":
        responseData = await getPollResults(data.eventId);
        break;
      case "pollResultsDetail":
        responseData = await getPollResultsDetails(data.eventId);
        break;
      case "pollEventUsersVoted":
        responseData = await getEventUsersWithVoteCount(data.eventId);
        break;
    }
    exportFile(relPath, absPath, responseData, res);
  } catch (error) {
    res.send(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
    );
  }
}

function exportFile(relPath, absPath, responseData, res) {
  const ws = fs.createWriteStream(relPath);
  fastcsv
    .write(responseData, { headers: true, delimiter: ";", quote: true })
    .pipe(ws);
  ws.on("finish", () => {
    res.download(absPath, function () {
      fs.unlink(absPath, (error) => {
        console.error(error);
      });
    });
  });
}
