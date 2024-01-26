export class InvalidAnonymousLoginError extends Error {
  constructor(
    message = "An Anonymous login for events without a lobby is not possible.",
  ) {
    super(message);
    this.name = "InvalidAnonymousLoginError";
  }
}
