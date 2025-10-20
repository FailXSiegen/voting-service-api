import { findOneByShortCode } from "../../repository/event-user-shortlink-repository";
import { findOneById as findEventUserById } from "../../repository/event-user-repository";
import { findById as findEventById } from "../../repository/event-repository";

export default async function resolveShortlink(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const { shortCode } = req.params;

    // Find the shortlink in database
    const shortlink = await findOneByShortCode(shortCode);
    if (!shortlink) {
      res.status(404);
      return res.send(
        JSON.stringify({
          success: false,
          error: "Shortlink not found",
        })
      );
    }

    // Get event user and event details
    const eventUser = await findEventUserById(shortlink.eventUserId);
    const event = await findEventById(shortlink.eventId);

    if (!eventUser || !event) {
      res.status(404);
      return res.send(
        JSON.stringify({
          success: false,
          error: "Event or user not found",
        })
      );
    }

    // Return the data for frontend redirect
    res.status(200);
    res.send(
      JSON.stringify({
        success: true,
        data: {
          eventSlug: event.slug,
          username: eventUser.username,
          publicName: eventUser.publicName,
        },
      })
    );
  } catch (error) {
    console.error("Shortlink resolve error:", error);
    res.status(500);
    res.send(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      })
    );
  }
}
