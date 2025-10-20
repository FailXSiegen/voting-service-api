import { findOneByShortCode } from "../../repository/event-user-shortlink-repository";
import { findOneById as findEventUserById } from "../../repository/event-user-repository";
import { findById as findEventById } from "../../repository/event-repository";

export default async function redirectShortlink(req, res) {
  try {
    const { shortCode } = req.params;

    // Find the shortlink in database
    const shortlink = await findOneByShortCode(shortCode);
    if (!shortlink) {
      return res.status(404).send("Shortlink not found");
    }

    // Get event user and event details
    const eventUser = await findEventUserById(shortlink.eventUserId);
    const event = await findEventById(shortlink.eventId);

    if (!eventUser || !event) {
      return res.status(404).send("Event or user not found");
    }

    // Build redirect URL with query parameters
    const baseUrl = process.env.CLIENT_BASE_URL || "http://localhost:5173";
    const params = new URLSearchParams();

    if (eventUser.username) {
      params.append("username", eventUser.username);
    }
    if (eventUser.publicName) {
      params.append("publicname", eventUser.publicName);
    }

    const redirectUrl = `${baseUrl}/event/${event.slug}?${params.toString()}`;

    // Perform redirect
    res.redirect(302, redirectUrl);
  } catch (error) {
    console.error("Shortlink redirect error:", error);
    res.status(500).send("Internal server error");
  }
}
