import loginOrganizer from "../auth/login/login-organizer";
import { loginEventUser } from "../auth/login/login-event-user";

export default async function loginRequest(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    const requestArguments = req.body;
    if (!requestArguments.loginType) {
      // throw missing loginType argument error
      throw new Error("Missing loginType");
    }
    let result = {};
    switch (requestArguments.loginType) {
      case "organizer":
        result = await loginOrganizer(requestArguments);
        break;
      case "event-user":
        result = await loginEventUser(requestArguments);
        break;
      default:
        throw new Error("Invalid loginTyp");
    }

    res.status(201);
    res.cookie("refreshToken", result.refreshToken, {
      maxAge: 86400 * 30 * 1000, // Lasts 30 days.
      httpOnly: true,
      signed: true,
      secure: process.env.NODE_ENV === "production",
    });
    res.send(
      JSON.stringify({
        succes: true,
        token: result.token,
        expiresAt: result.decodedToken.exp,
      }),
    );
  } catch (error) {
    res.send(
      JSON.stringify({
        succes: false,
        error: error,
      }),
    );
  }
}
