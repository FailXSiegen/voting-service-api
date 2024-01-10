import { createError } from "apollo-errors";

const RecordNotFoundError = createError("RecordNotFoundError", {
  message: "Could not find the requested record.",
  name: "RecordNotFoundError",
});

export default RecordNotFoundError;
