import { deleteAllByEventId } from "../../repository/event-user-shortlink-repository";

export default async function clearShortlinksByEvent(req, res) {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      return res.status(400).send(
        JSON.stringify({
          success: false,
          error: "Event ID is required",
        })
      );
    }

    const deleted = await deleteAllByEventId(parseInt(eventId));

    res.send(
      JSON.stringify({
        success: deleted,
        message: deleted ? "All shortlinks deleted successfully" : "Failed to delete shortlinks",
      })
    );
  } catch (error) {
    console.error("Error clearing shortlinks:", error);
    res.status(500).send(
      JSON.stringify({
        success: false,
        error: error.message,
      })
    );
  }
}
