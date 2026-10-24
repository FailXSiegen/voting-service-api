// End-to-End-Abstimmung über HTTP + WebSocket: Organizer-Login, Event, 3 Teilnehmer,
// Poll mit Live-Subscription, Stimmabgabe, Schließen, Ergebnis.
// Legt Daten an – deshalb nur gegen localhost (z. B. Container mit DB-Kopie).
//
//   E2E_API=http://localhost:4000 E2E_ORG_USER=… E2E_ORG_PASS=… E2E_ORG_ID=… node scripts/e2e-vote-flow.mjs
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const API = process.env.E2E_API || 'http://localhost:4000';
const { E2E_ORG_USER, E2E_ORG_PASS, E2E_ORG_ID } = process.env;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API)) {
  throw new Error(`E2E legt Daten an, nur gegen localhost erlaubt (E2E_API=${API})`);
}
if (!E2E_ORG_USER || !E2E_ORG_PASS || !E2E_ORG_ID) throw new Error('E2E_ORG_USER/_PASS/_ID fehlen');

const USERS = 3;
const step = (msg) => console.log(`✔ ${msg}`);
const waitFor = async (cond, what, ms = 10000) => {
  for (
    const end = Date.now() + ms;
    Date.now() < end;
    await new Promise((r) => setTimeout(r, 100))
  ) {
    if (cond()) return;
  }
  throw new Error(`Timeout: ${what}`);
};

async function login(body) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Login ${body.loginType} ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
}

async function gql(token, query, variables) {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const orgToken = await login({
  loginType: 'organizer',
  username: E2E_ORG_USER,
  password: E2E_ORG_PASS,
});
step('Organizer-Login (argon2)');

const now = Math.floor(Date.now() / 1000);
const { createEvent: event } = await gql(
  orgToken,
  'mutation($i: CreateEventInput!) { createEvent(input: $i) { id slug } }',
  {
    i: {
      title: 'E2E Node 22',
      slug: `e2e-${now}`,
      scheduledDatetime: now,
      organizerId: E2E_ORG_ID,
      lobbyOpen: true,
      active: true,
      multivoteType: 1,
      async: false,
      allowMagicLink: false,
      publicVoteVisible: false,
      // Spalten ohne DB-Default – der Client schickt sie immer mit
      videoConferenceConfig: '{}',
      styles: '',
      logo: '',
      description: '',
    },
  }
);
step(`Event ${event.id} (${event.slug}) angelegt`);

const users = [];
for (let n = 1; n <= USERS; n++) {
  const { createEventUser: u } = await gql(
    orgToken,
    'mutation($i: CreateEventUserInput!) { createEventUser(input: $i) { id username } }',
    {
      i: {
        eventId: event.id,
        username: `e2e-user-${n}`,
        publicName: `E2E ${n}`,
        verified: true,
        allowToVote: true,
        voteAmount: 1,
      },
    }
  );
  // Erster Login setzt das Passwort
  const token = await login({
    loginType: 'event-user',
    username: u.username,
    password: randomUUID(),
    eventId: event.id,
    displayName: `E2E ${n}`,
  });
  users.push({ ...u, token, events: [] });
}
step(`${USERS} Teilnehmer angelegt und eingeloggt`);

const clients = users.map((u) => {
  const client = createClient({
    url: `${API.replace(/^http/, 'ws')}/graphql`,
    webSocketImpl: WebSocket,
    connectionParams: { authorization: `Bearer ${u.token}` },
  });
  client.subscribe(
    {
      query:
        'subscription($e: ID) { pollLifeCycle(eventId: $e) { state pollResultId poll { id possibleAnswers { id content } } } }',
      variables: { e: event.id },
    },
    {
      next: ({ data }) => u.events.push(data.pollLifeCycle),
      error: (e) => u.events.push({ state: 'error', e }),
      complete: () => {},
    }
  );
  return client;
});
await new Promise((r) => setTimeout(r, 1500)); // Subscriptions registrieren lassen
step('WebSocket-Subscriptions offen');

const { createPoll: poll } = await gql(
  orgToken,
  'mutation($i: CreateNewPollInput!) { createPoll(input: $i, instantStart: true) { id possibleAnswers { id content } } }',
  {
    i: {
      eventId: event.id,
      title: 'E2E-Abstimmung',
      type: 'PUBLIC',
      pollAnswer: 'yesNoAbstain', // wie der Client
      list: '', // Spalte ohne DB-Default
      possibleAnswers: [{ content: 'Ja' }, { content: 'Nein' }, { content: 'Enthaltung' }],
      minVotes: 1,
      maxVotes: 1,
      allowAbstain: false,
    },
  }
);
await waitFor(
  () => users.every((u) => u.events.some((e) => e.state === 'new')),
  'pollLifeCycle "new" bei allen'
);
step(`Poll ${poll.id} gestartet, alle ${USERS} Teilnehmer haben "new" per WebSocket erhalten`);

const ja = poll.possibleAnswers.find((a) => a.content === 'Ja');
for (const u of users) {
  await gql(u.token, 'mutation($i: PollSubmitAnswerInput!) { createPollSubmitAnswer(input: $i) }', {
    i: {
      pollId: poll.id,
      eventUserId: u.id,
      type: 'PUBLIC',
      answerContent: 'Ja',
      possibleAnswerId: ja.id,
      voteCycle: 1,
      answerItemLength: 1,
      answerItemCount: 1,
      multivote: false,
      isLastAnswerInBallot: true,
    },
  });
}
step(`${USERS} Stimmen abgegeben`);

// Bei voller Beteiligung schließt der Server die Abstimmung selbst; sonst manuell
await new Promise((r) => setTimeout(r, 1500));
if (!users.every((u) => u.events.some((e) => e.state === 'closed'))) {
  await gql(orgToken, 'mutation($id: ID!) { stopPoll(id: $id) }', { id: poll.id });
}
await waitFor(
  () => users.every((u) => u.events.some((e) => e.state === 'closed')),
  'pollLifeCycle "closed" bei allen'
);
step('Abstimmung geschlossen, "closed" per WebSocket bei allen angekommen');

const { pollResult } = await gql(
  orgToken,
  'query($e: ID) { pollResult(eventId: $e, page: 0, pageSize: 10, includeHidden: true) { closed poll { id } pollAnswer { answerContent } } }',
  { e: event.id }
);
const result = pollResult.find((r) => r.poll.id === poll.id);
const jaCount = result?.pollAnswer.filter((a) => a.answerContent === 'Ja').length;
if (!result?.closed || jaCount !== USERS)
  throw new Error(`Ergebnis falsch: ${JSON.stringify(result)}`);
step(`Ergebnis korrekt: ${jaCount}× Ja, Poll geschlossen`);

const errors = users.flatMap((u) => u.events.filter((e) => e.state === 'error'));
if (errors.length) throw new Error(`Subscription-Fehler: ${JSON.stringify(errors)}`);
await Promise.all(clients.map((c) => c.dispose()));
console.log('\nE2E OK');
