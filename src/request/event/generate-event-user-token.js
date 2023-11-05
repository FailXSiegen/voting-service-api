import { v4 as uuidv4 } from "uuid";

export default async function genrateEventUserToken(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const token = uuidv4();
    // const { eventId } = req.body
    // todo add new event user
    res.send(
      JSON.stringify({
        data: {
          token,
        },
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
