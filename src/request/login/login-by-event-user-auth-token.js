import { addRefreshToken } from "../../auth/login/refresh-token";
import { generateJwt } from "../../lib/jwt-auth";
import * as jwt from "jsonwebtoken";
import { findOneByToken } from "../../repository/event-user-auth-token-repository";
import { findOneById } from "../../repository/event-user-repository";

export default async function loginByEventUserAuthToken(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const { eventUserAuthToken } = req.signedCookies;
    if (!eventUserAuthToken) {
      throw new Error("Could not fetch eventUserAuthToken cookie");
    }

    const tokenRecord = await findOneByToken(eventUserAuthToken);
    const eventUser = await findOneById(tokenRecord?.eventUserId);

    if (!tokenRecord || !eventUser) {
      // Token record not found...
      res.status(200);
      res.send(
        JSON.stringify({
          success: false,
        }),
      );
      return;
    }

    const claims = {
      user: {
        id: tokenRecord.eventUserId,
        type: "event-user",
        verified: eventUser.verified == true,
      },
      role: "event-user",
    };
    const token = await generateJwt(claims);
    const decodedToken = await jwt.verify(token, process.env.JWT_SECRET);
    const refreshToken = await addRefreshToken(
      decodedToken.user.type,
      decodedToken.user.id,
    );

    res.status(201);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: process.env.NODE_ENV === "production",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400 * 30 * 1000, // Lasts 30 days.
      signed: true,
    });
    res.send(
      JSON.stringify({
        token: token,
        expiresAt: decodedToken.exp,
      }),
    );
  } catch (error) {
    res.send("Error: " + error.message);
  }
}
