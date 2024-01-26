export class InactiveEventLoginError extends Error {
  constructor(message = "Login for inactive events are not possible.") {
    super(message);
    this.name = "InactiveEventLoginError";
  }
}
