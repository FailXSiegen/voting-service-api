import { createError } from "apollo-errors";

const SlugAlreadyExistsError = createError("SlugAlreadyExistsError", {
  message: "The provided slug already exists.",
});

export default SlugAlreadyExistsError;
