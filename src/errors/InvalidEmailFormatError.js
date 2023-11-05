import { createError } from "apollo-errors";

const InvalidEmailFormatError = createError("InvalidEmailFormatError", {
  message: "The provided email has an invalid format.",
});

export default InvalidEmailFormatError;
