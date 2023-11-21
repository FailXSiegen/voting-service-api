import { v4 as uuidv4 } from "uuid";
import {
  activate,
  findOneInactiveByToken,
} from "../../repository/event-user-auth-token-repository";
import { update as updateEventUser } from "../../repository/event-user-repository";
import RecordNotFoundError from "../../errors/RecordNotFoundError";

export default async function activateEventUserAuthToken(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const { token, username, publicName } = req.body;
    const existingToken = await findOneInactiveByToken(token);
    if (null === existingToken) {
      throw new RecordNotFoundError("Token is invalid");
    }
    await updateEventUser({
      id: existingToken.eventUserId,
      username,
      publicName,
    });
    // Generate a new token for security reasons.
    const newToken = uuidv4();
    await activate(token, newToken);
    // Set a cookie with the new token.
    res.status(201);
    res.cookie("eventUserAuthToken", newToken, {
      httpOnly: process.env.NODE_ENV === "production",
      secure: process.env.NODE_ENV === "production",
      signed: true,
      sameSite: "strict",
    });
    res.send(
      JSON.stringify({
        success: true,
      }),
    );
  } catch (error) {
    res.send(
      JSON.stringify({
        error: error,
        success: false,
      }),
    );
  }
}
