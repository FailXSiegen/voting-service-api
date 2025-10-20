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
    console.error("Login error:", error);

    let errorMessage = "Login failed";
    let errorCode = "UNKNOWN_ERROR";

    if (error.constructor.name === "AuthenticationError" ||
        (error.constructor.name === "ApolloError" && error.message === "Not authorized.")) {
      errorMessage = "Invalid username or password";
      errorCode = "INVALID_CREDENTIALS";
    } else if (error.message && error.message.includes("Could not find organizer")) {
      errorMessage = "User not found or not verified";
      errorCode = "USER_NOT_FOUND";
    } else if (error.message && error.message.includes("Missing loginType")) {
      errorMessage = "Login type is required";
      errorCode = "MISSING_LOGIN_TYPE";
    } else if (error.message && error.message.includes("Invalid loginTyp")) {
      errorMessage = "Invalid login type";
      errorCode = "INVALID_LOGIN_TYPE";
    } else if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      errorMessage = "Database connection error";
      errorCode = "DATABASE_ERROR";
    } else if (error.message) {
      errorMessage = error.message;
      errorCode = "GENERAL_ERROR";
    }

    res.send(
      JSON.stringify({
        succes: false,
        error: {
          message: errorMessage,
          code: errorCode,
          type: error.constructor.name || "Error"
        },
      }),
    );
  }
}
