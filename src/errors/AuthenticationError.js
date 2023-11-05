import { createError } from "apollo-errors";

const AuthenticationError = createError("AuthenticationError", {
  message: "Not authorized.",
});

export default AuthenticationError;
