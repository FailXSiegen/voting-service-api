import resolveMeeting from './meeting-resolver';
import { optionalUser } from '../../auth/user-context';
import { canAccessEvent } from '../../graphql/authorize';
import { lookup } from '../../graphql/authorize-lookup';

// SEC-17: Felder, die die Login-Seite eines Events braucht. Kein videoConferenceConfig
// (enthält Meeting-Zugangsdaten), keine Organizer-IDs.
// MAGIC-1: createDatetime nicht mehr öffentlich (der Client leitete daraus das Magic-Link-Passwort ab).
const PUBLIC_EVENT_FIELDS = [
  'id',
  'title',
  'slug',
  'description',
  'styles',
  'logo',
  'scheduledDatetime',
  'modifiedDatetime',
  'lobbyOpen',
  'active',
  'multivoteType',
  'async',
  'allowMagicLink',
  'publicVoteVisible',
  'finished',
  'endDatetime',
  'publicnameReadonly',
];

const pick = (record, fields) =>
  Object.fromEntries(
    fields.filter((field) => field in record).map((field) => [field, record[field]])
  );

// Meeting (ohne SDK-Key/-Secret) nur für Teilnehmer bzw. Organizer genau dieses Events.
export async function toPublicEvent(event, req) {
  const result = pick(event, PUBLIC_EVENT_FIELDS);
  if (!event.videoConferenceConfig) return result;
  const user = await optionalUser(req);
  if (!(await canAccessEvent(event.id, user, lookup))) return result;
  const { meeting } = await resolveMeeting({ ...event });
  if (meeting) {
    result.meeting = pick(meeting, ['id', 'title', 'type', 'serverUrl', 'credentials']);
  }
  return result;
}
