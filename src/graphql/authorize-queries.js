// SEC-15: Rechte je Query. Deny-by-default: eine Query ohne Regel ist nur für Super-Admins.
import { canAccessEvent, canAccessEventAsOrganizer } from './authorize';
import { query } from '../lib/database';

const deny = () => {
  throw new Error('Not authorized.');
};

const isOrganizer = (user) => user?.type === 'organizer';
const isSuperAdmin = async (user, lookup) =>
  isOrganizer(user) && Boolean(await lookup('isSuperOrganizer', user.id));

async function ownsRecord(kind, id, user, lookup) {
  if (!isOrganizer(user)) return false;
  if (await isSuperAdmin(user, lookup)) return true;
  const owners = await lookup(kind, id);
  return owners.some((owner) => Number(owner) === Number(user.id));
}

async function eventIdOfPoll(pollId) {
  const rows = await query('SELECT event_id FROM poll WHERE id = ?', [pollId]);
  return rows?.[0]?.eventId ?? null;
}

const self = (user, organizerId) => isOrganizer(user) && Number(organizerId) === Number(user.id);

// Regel: (args, user, lookup) -> boolean. Ohne Login kommt hier niemand an (authenticate.js),
// außer bei den öffentlichen Feldern; die stehen in PUBLIC.
const PUBLIC = () => true;
const LOGGED_IN = (args, user) => Boolean(user);
const SUPER_ADMIN = (args, user, lookup) => isSuperAdmin(user, lookup);
const OWN_ORGANIZER = async (args, user, lookup) =>
  self(user, args.organizerId) || isSuperAdmin(user, lookup);
const EVENT_MEMBER = (args, user, lookup) => canAccessEvent(args.eventId, user, lookup);
const EVENT_ORGANIZER = (args, user, lookup) =>
  canAccessEventAsOrganizer(args.eventId, user, lookup);
const EVENT_USER_SELF_OR_ORGANIZER = async (eventUserId, user, lookup) =>
  (user?.type === 'event-user' && Number(user.id) === Number(eventUserId)) ||
  ownsRecord('eventUser', eventUserId, user, lookup);

const RULES = {
  // Öffentlich (siehe auch PUBLIC_QUERY_FIELDS in authenticate.js)
  systemSettings: PUBLIC,
  staticContentsByPage: PUBLIC,
  staticContentBySection: PUBLIC,
  staticContentByPageSlug: PUBLIC,
  pageSlugs: PUBLIC,
  pageSlugByPageKey: PUBLIC,
  pageSlugBySlug: PUBLIC,
  translations: PUBLIC,
  translationsByLocale: PUBLIC,
  // CMS: Resolver prüfen canEditContent selbst bzw. filtern auf Veröffentlichtes.
  staticContents: LOGGED_IN,
  staticContent: LOGGED_IN,
  staticContentVersions: LOGGED_IN,
  mediaItems: LOGGED_IN,
  media: LOGGED_IN,
  // Organizer
  organizer: OWN_ORGANIZER,
  organizers: SUPER_ADMIN,
  upcomingEvents: OWN_ORGANIZER,
  expiredEvents: OWN_ORGANIZER,
  allUpcomingEvents: SUPER_ADMIN,
  allPastEvents: SUPER_ADMIN,
  pollCacheStats: SUPER_ADMIN,
  event: (args, user, lookup) => canAccessEventAsOrganizer(args.id, user, lookup),
  eventUsers: EVENT_ORGANIZER,
  // Teilnehmer sehen geschlossene, sichtbare Ergebnisse ihres Events; versteckte nur Organizer.
  pollResult: (args, user, lookup) =>
    args.includeHidden ? EVENT_ORGANIZER(args, user, lookup) : EVENT_MEMBER(args, user, lookup),
  activePoll: EVENT_ORGANIZER,
  zoomMeeting: (args, user, lookup) => ownsRecord('zoomMeeting', args.id, user, lookup),
  jitsiMeeting: (args, user, lookup) => ownsRecord('jitsiMeeting', args.id, user, lookup),
  // Teilnehmer und Organizer des Events
  polls: EVENT_MEMBER,
  pollsWithNoResults: EVENT_MEMBER,
  activePollEventUser: EVENT_MEMBER,
  cachedActivePollEventUser: EVENT_MEMBER,
  poll: async (args, user, lookup) => canAccessEvent(await eventIdOfPoll(args.id), user, lookup),
  eventUser: (args, user, lookup) => EVENT_USER_SELF_OR_ORGANIZER(args.id, user, lookup),
  userVoteCycle: (args, user, lookup) =>
    EVENT_USER_SELF_OR_ORGANIZER(args.eventUserId, user, lookup),
};

export function protectQueries(queries, lookup) {
  if (process.env.ENABLE_JWT !== '1') return queries;
  return Object.fromEntries(
    Object.entries(queries).map(([name, resolver]) => [
      name,
      async (parent, args, context, info) => {
        const rule = RULES[name] || SUPER_ADMIN;
        if (!(await rule(args || {}, context?.user, lookup))) deny();
        return resolver(parent, args, context, info);
      },
    ])
  );
}

// Felder, die nie (password/hash) bzw. nur für Besitzer (Zoom-Secret) an Clients gehen.
export const organizerFieldGuards = {
  password: () => null,
  hash: () => null,
};

export function zoomMeetingFieldGuards(lookup) {
  const ownerOnly = (field) => async (meeting, args, context) => {
    if (
      process.env.ENABLE_JWT === '1' &&
      !(await ownsRecord('zoomMeeting', meeting.id, context?.user, lookup))
    ) {
      return null;
    }
    return meeting[field] ?? null;
  };
  return { sdkSecret: ownerOnly('sdkSecret'), password: ownerOnly('password') };
}
