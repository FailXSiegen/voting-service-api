import RecordNotFoundError from "../../errors/RecordNotFoundError";
import { findById } from "../../repository/event-repository";

export default async function fetchEventById(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const { id } = req.params;
    if (!id) {
      throw new Error("Missing required parameter id.");
    }
    const event = await findById(id);
    if (null === event) {
      throw new RecordNotFoundError("Event not found.");
    }
    res.send(
      JSON.stringify({
        event,
        success: true,
      }),
    );
  } catch (error) {
    res.send(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
    );
  }
}
