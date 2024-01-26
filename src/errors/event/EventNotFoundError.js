export class EventNotFoundError extends Error {
  constructor(message = "Event not found.") {
    super(message);
    this.name = "EventNotFoundError";
  }
}
