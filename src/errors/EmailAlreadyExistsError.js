import { createError } from "apollo-errors";

const EmailAlreadyExistsError = createError("EmailAlreadyExistsError", {
  message: "The provided email already exists.",
});

export default EmailAlreadyExistsError;
