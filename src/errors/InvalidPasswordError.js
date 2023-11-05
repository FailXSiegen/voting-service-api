import { createError } from "apollo-errors";

const InvalidPasswordError = createError("InvalidPasswordError", {
  message: "The given password is invalid.",
  name: "InvalidPasswordError",
});

export default InvalidPasswordError;
