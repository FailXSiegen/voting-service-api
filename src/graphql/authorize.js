/* global Set */
// Who may call which mutation or subscribe to which event. Pure: DB access comes in as `lookup`.
const PARTICIPANT_MUTATIONS = new Set([
  'createPollSubmitAnswer',
  'createBulkPollSubmitAnswer',
  'createMultiPollSubmitAnswer',
]);

const CONTENT_MUTATIONS = new Set([
  'createStaticContent',
  'updateStaticContent',
  'deleteStaticContent',
  'toggleStaticContentPublished',
  'revertStaticContentToVersion',
  'upsertPageSlug',
  'deletePageSlug',
  'deleteMedia',
]);

// Mutation -> records whose owner the organizer must be: [kind, id].
const OWNED_RECORDS = {
  updateEvent: (a) => [['event', a.input.id]],
  createEventUserShortlink: (a) => [['eventUser', a.eventUserId]],
  updateEventStatus: (a) => [['event', a.input.id]],
  removeEvent: (a) => [['event', a.id]],
  transferEvent: (a) => [['event', a.eventId]],
  resetEventOrganizer: (a) => [['event', a.eventId]],
  createPoll: (a) => [['event', a.input.eventId]],
  createEventUser: (a) => [['event', a.input.eventId]],
  createEventUserAuthToken: (a) => [['event', a.input.eventId]],
  updatePoll: (a) => [
    ['poll', a.input.id],
    ['event', a.input.eventId],
  ],
  removePoll: (a) => [['poll', a.id]],
  startPoll: (a) => [['poll', a.id]],
  stopPoll: (a) => [['pollResult', a.id]],
  togglePollResultHidden: (a) => [['pollResult', a.pollResultId]],
  updateEventUser: (a) => [
    ['eventUser', a.input.id],
    ...(a.input.eventId ? [['event', a.input.eventId]] : []),
  ],
  deleteEventUser: (a) => [['eventUser', a.eventUserId]],
  updateUserToGuest: (a) => [['eventUser', a.eventUserId]],
  updateUserToParticipant: (a) => [['eventUser', a.eventUserId]],
  transferVotes: (a) => [['eventUser', a.input.sourceUserId]],
  updateZoomMeeting: (a) => [['zoomMeeting', a.input.id]],
  deleteZoomMeeting: (a) => [['zoomMeeting', a.id]],
  updateJitsiMeeting: (a) => [['jitsiMeeting', a.input.id]],
  deleteJitsiMeeting: (a) => [['jitsiMeeting', a.id]],
};

const FOR_OWN_ORGANIZER = new Set(['createEvent', 'createZoomMeeting', 'createJitsiMeeting']);

const ORGANIZER_ADMIN_FIELDS = ['verified', 'confirmedEmail', 'superAdmin', 'canEditContent'];

const deny = () => {
  throw new Error('Not authorized.');
};

// Current and original organizer both keep access, so a transferred event stays usable for both.
async function ownsRecord(kind, id, organizerId, lookup) {
  const owners = await lookup(kind, id);
  return owners.some((owner) => Number(owner) === Number(organizerId));
}

async function assertOrganizerAllowed(name, args, user, lookup) {
  const organizer = user.organizer;
  if (organizer?.superAdmin) return;

  if (name === 'updateOrganizer') {
    const isSelf = Number(args.input.id) === Number(user.id);
    if (!isSelf || ORGANIZER_ADMIN_FIELDS.some((f) => args.input[f] !== undefined)) deny();
    return;
  }
  if (CONTENT_MUTATIONS.has(name)) {
    if (!organizer?.canEditContent) deny();
    return;
  }
  if (FOR_OWN_ORGANIZER.has(name)) {
    if (Number(args.input.organizerId) !== Number(user.id)) deny();
    return;
  }
  const records = OWNED_RECORDS[name]?.(args);
  if (!records) deny(); // Everything not listed is super-admin only.
  for (const [kind, id] of records) {
    if (!(await ownsRecord(kind, id, user.id, lookup))) deny();
  }
}

async function assertAllowed(name, args, user, lookup) {
  // SEC-08: Stimmen gibt nur der Wähler selbst ab – auch ein Super-Admin nicht in dessen Namen.
  if (PARTICIPANT_MUTATIONS.has(name)) {
    if (user?.type === 'event-user' && Number(args.input?.eventUserId) === Number(user.id)) {
      return;
    }
    deny();
  }
  if (user?.type === 'organizer') {
    return assertOrganizerAllowed(name, args, user, lookup);
  }
  deny();
}

function protectMutations(mutations, lookup) {
  if (process.env.ENABLE_JWT !== '1') return mutations;
  return Object.fromEntries(
    Object.entries(mutations).map(([name, resolver]) => [
      name,
      async (parent, args, context, info) => {
        await assertAllowed(name, args, context?.user, lookup);
        return resolver(parent, args, context, info);
      },
    ])
  );
}

function canReceiveTokenRefresh(eventUserId, user) {
  if (process.env.ENABLE_JWT !== '1') return true;
  return user?.type === 'event-user' && Number(user.id) === Number(eventUserId);
}

async function organizerCanAccessEvent(eventId, user, lookup) {
  if (await lookup('isSuperOrganizer', user.id)) return true;
  return ownsRecord('event', eventId, user.id, lookup);
}

// Participants and organizers of the event.
async function canAccessEvent(eventId, user, lookup) {
  if (process.env.ENABLE_JWT !== '1') return true;
  if (!eventId) return false;
  if (user?.type === 'event-user') return Number(user.eventId) === Number(eventId);
  if (user?.type === 'organizer') return organizerCanAccessEvent(eventId, user, lookup);
  return false;
}

async function canAccessEventAsOrganizer(eventId, user, lookup) {
  if (process.env.ENABLE_JWT !== '1') return true;
  if (user?.type !== 'organizer' || !eventId) return false;
  return organizerCanAccessEvent(eventId, user, lookup);
}

async function canReceiveAccessRights(payload, args, user, lookup) {
  if (process.env.ENABLE_JWT !== '1') return true;
  if (user?.type === 'organizer') return organizerCanAccessEvent(payload.eventId, user, lookup);
  return canReceiveTokenRefresh(args.eventUserId, user);
}

module.exports = {
  assertAllowed,
  protectMutations,
  canReceiveTokenRefresh,
  canAccessEvent,
  canAccessEventAsOrganizer,
  canReceiveAccessRights,
};
