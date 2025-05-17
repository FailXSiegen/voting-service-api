import { findOneByUsername } from "../../repository/organizer-repository";
import AuthenticationError from "../../errors/AuthenticationError";
import { generateJwt } from "../../lib/jwt-auth";
import * as jwt from "jsonwebtoken";
import { addRefreshToken } from "./refresh-token";
import verifyPassword from "./login-verify-password";

export default async function loginOrganizer({ username, password }) {
  // Fetch organizer record.
  const organizer = await findOneByUsername(username);
  if (!organizer || !organizer.verified) {
    throw new Error(
      "Could not find organizer with the following email or is not yet verified: " +
        username,
    );
  }
  // validate password
  const passwordIsValid = await verifyPassword(username, password);
  if (!passwordIsValid) {
    throw new AuthenticationError();
  }
  // Create jwt and refresh token.
  const refreshToken = await addRefreshToken("organizer", organizer.id);
  const claims = {
    user: { id: organizer.id, type: "organizer" },
    role: "organizer",
    // Für Organizer fügen wir keine eventUserId hinzu, da diese nicht existiert
    organizerId: organizer.id  // Stattdessen setzen wir die organizerId für WebSocket-Auth
  };
  const token = await generateJwt(claims);
  const decodedToken = await jwt.verify(token, process.env.JWT_SECRET);
  return { token, decodedToken, refreshToken };
}
