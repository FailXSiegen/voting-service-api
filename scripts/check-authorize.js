// Run: node scripts/check-authorize.js
const assert = require('assert');
const {
  assertAllowed,
  canAccessEvent,
  canAccessEventAsOrganizer,
  canReceiveAccessRights,
  canReceiveTokenRefresh,
} = require('../src/graphql/authorize');

const owners = { event: { 1: [10, 20], 2: [30] }, eventUser: { 5: [10, 20] }, poll: { 3: [30] } };
const lookup = async (kind, id) =>
  kind === 'isSuperOrganizer' ? Number(id) === 99 : owners[kind]?.[id] || [];
const allowed = (name, args, user) =>
  assertAllowed(name, args, user, lookup).then(
    () => true,
    () => false
  );
const org = (id, organizer = {}) => ({ type: 'organizer', id, organizer });
const self = { type: 'event-user', id: 7, eventId: 1 };
const vote = 'createBulkPollSubmitAnswer';

(async () => {
  process.env.ENABLE_JWT = '1';
  const checks = [
    // Participants: only their own votes.
    [true, vote, { input: { eventUserId: '7' } }, self],
    [false, vote, { input: { eventUserId: '8' } }, self],
    [false, vote, { input: {} }, self],
    [false, 'transferVotes', { input: { sourceUserId: 5 } }, self],
    [false, vote, { input: { eventUserId: '7' } }, undefined],
    // Transferred event: current (10) and original (20) organizer, nobody else.
    [true, 'transferVotes', { input: { sourceUserId: 5 } }, org(10)],
    [true, 'transferVotes', { input: { sourceUserId: 5 } }, org(20)],
    [false, 'transferVotes', { input: { sourceUserId: 5 } }, org(30)],
    [true, 'createPoll', { input: { eventId: 1 } }, org(20)],
    [false, 'createPoll', { input: { eventId: 2 } }, org(10)],
    [false, 'updatePoll', { input: { id: 3, eventId: 1 } }, org(10)],
    [false, 'stopPoll', { id: 404 }, org(10)],
    [true, 'transferEvent', { eventId: 2 }, org(99, { superAdmin: 1 })],
    // Organizer records and escalation.
    [true, 'updateOrganizer', { input: { id: 10, email: 'x' } }, org(10)],
    [false, 'updateOrganizer', { input: { id: 11, email: 'x' } }, org(10)],
    [false, 'updateOrganizer', { input: { id: 10, superAdmin: true } }, org(10)],
    [true, 'createEvent', { input: { organizerId: 10 } }, org(10)],
    [false, 'createEvent', { input: { organizerId: 11 } }, org(10)],
    // Unlisted is super-admin only, content needs the content flag.
    [false, 'deleteOrganizer', { id: 1 }, org(10)],
    [true, 'deleteOrganizer', { id: 1 }, org(99, { superAdmin: 1 })],
    [false, 'deleteMedia', { id: 1 }, org(10)],
    [true, 'deleteMedia', { id: 1 }, org(10, { canEditContent: 1 })],
  ];
  for (const [expected, name, args, user] of checks) {
    assert.equal(await allowed(name, args, user), expected, `${name} ${JSON.stringify(args)}`);
  }

  assert.equal(canReceiveTokenRefresh('7', self), true);
  assert.equal(canReceiveTokenRefresh('8', self), false);
  assert.equal(canReceiveTokenRefresh('1', org(1)), false);
  assert.equal(await canAccessEvent(1, self, lookup), true);
  assert.equal(await canAccessEvent(2, self, lookup), false);
  assert.equal(await canAccessEvent(1, undefined, lookup), false);
  assert.equal(await canAccessEvent(1, org(20), lookup), true);
  assert.equal(await canAccessEvent(1, org(30), lookup), false);
  assert.equal(await canAccessEvent(1, org(99), lookup), true);
  assert.equal(await canAccessEventAsOrganizer(1, self, lookup), false);
  assert.equal(await canReceiveAccessRights({ eventId: 1 }, {}, org(10), lookup), true);
  assert.equal(await canReceiveAccessRights({ eventId: 2 }, {}, org(10), lookup), false);

  console.log('authorize ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
