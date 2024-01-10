import md5 from "md5";
import { getCurrentUnixTimeStamp } from "../time-stamp";
import { findOneByHash, update } from "../../repository/organizer-repository";

async function insertOrganizerHash(hash, organizer) {
  const input = {
    id: organizer.id,
    hash,
  };
  await update(input);
}

export async function validate(hash) {
  const organizer = await findOneByHash(hash);
  return organizer !== null && organizer.id > 0;
}

export async function generateAndSetOrganizerHash(organizer) {
  const currentTime = getCurrentUnixTimeStamp();
  const hash = await md5(organizer.id + currentTime);
  await insertOrganizerHash(hash, organizer);
  return hash;
}
