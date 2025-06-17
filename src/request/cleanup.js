import { performEventCleanup } from "../services/event-cleanup.js";

export default async function cleanUp(req, res) {
  res.setHeader("content-type", "application/json");
  const origin = req.get("origin");
  const result = await performEventCleanup(origin);
  res.send(JSON.stringify(result));
}
