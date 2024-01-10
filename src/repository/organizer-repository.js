import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery,
} from "./../lib/database";
import { hash } from "../lib/crypto";
import { getCurrentUnixTimeStamp } from "../lib/time-stamp";
import { validateEmail } from "../lib/validator";
import InvalidEmailFormatError from "../errors/InvalidEmailFormatError";
import { findByOrganizerId } from "./meeting/zoom-meeting-repository";

export async function findOneByEmail(email) {
  const result = await query("SELECT * FROM organizer WHERE email = ?", [
    email,
  ]);
  const organizer = Array.isArray(result) ? result[0] || null : null;
  return enrichRelations(organizer);
}

export async function findOneByUsername(username) {
  const result = await query("SELECT * FROM organizer WHERE username = ?", [
    username,
  ]);
  const organizer = Array.isArray(result) ? result[0] || null : null;
  return enrichRelations(organizer);
}

export async function findOneById(id) {
  const result = await query("SELECT * FROM organizer WHERE id = ?", [id]);
  const organizer = Array.isArray(result) ? result[0] || null : null;
  return enrichRelations(organizer);
}

export async function findOneByHash(hash) {
  const result = await query("SELECT * FROM organizer WHERE hash = ?", [hash]);
  const organizer = Array.isArray(result) ? result[0] || null : null;
  return enrichRelations(organizer);
}

export async function findOrganizers() {
  const organizers = await query("SELECT * FROM organizer");
  if (!Array.isArray(organizers)) {
    return [];
  }
  return organizers;
}

export async function create(input) {
  if (!validateEmail(input.email)) {
    throw new InvalidEmailFormatError();
  }
  input.password = await hash(input.password);
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("organizer", input);
}

export async function update(input) {
  if (input.email && !validateEmail(input.email)) {
    throw new InvalidEmailFormatError();
  }
  if (input.password) {
    input.password = await hash(input.password);
  }
  await updateQuery("organizer", input);
}

export async function remove(id) {
  await query("DELETE FROM jwt_refresh_token WHERE organizer_id = ?", id);
  return await removeQuery("organizer", id);
}

async function enrichRelations(organizer) {
  // First check, if we really received an organizer record.
  if (organizer === null) {
    return null;
  }
  organizer = enrichZoomMeetings(organizer);
  return organizer;
}

async function enrichZoomMeetings(organizer) {
  organizer.zoomMeetings = await findByOrganizerId(organizer.id);
  return organizer;
}
