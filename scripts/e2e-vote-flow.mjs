// End-to-End-Abstimmung über HTTP + WebSocket: Organizer-Login, Event, N Teilnehmer,
// Poll mit Live-Subscription, Stimmabgabe, Schließen, Ergebnis – mit Zeitmessung je Phase.
// Legt Daten an – deshalb nur gegen localhost oder einen Wegwerf-Klon (Docker-Host e2e-*).
//
//   E2E_API=http://localhost:4000 E2E_ORG_USER=… E2E_ORG_PASS=… E2E_ORG_ID=… [E2E_USERS=3] \
//     node scripts/e2e-vote-flow.mjs
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const API = process.env.E2E_API || 'http://localhost:4000';
const { E2E_ORG_USER, E2E_ORG_PASS, E2E_ORG_ID } = process.env;
if (!/^https?:\/\/(localhost|127\.0\.0\.1|e2e-[a-z0-9-]+)(:|\/|$)/.test(API)) {
  throw new Error(
    `E2E legt Daten an, nur gegen localhost oder einen e2e-*-Klon erlaubt (E2E_API=${API})`
  );
}
if (!E2E_ORG_USER || !E2E_ORG_PASS || !E2E_ORG_ID) throw new Error('E2E_ORG_USER/_PASS/_ID fehlen');

const USERS = Number(process.env.E2E_USERS || 3);
const PARALLEL = 50; // gleichzeitige HTTP-Requests je Block
const TIMEOUT = Math.max(10000, USERS * 60); // Wartezeit für WebSocket-Fan-out

const step = (msg) => console.log(`✔ ${msg}`);
const now = () => performance.now();
const pct = (arr, p) =>
  [...arr]
    .sort((a, b) => a - b)
    [Math.min(arr.length - 1, Math.floor((arr.length * p) / 100))].toFixed(0);
const stats = (arr) => `p50 ${pct(arr, 50)} ms, p95 ${pct(arr, 95)} ms, max ${pct(arr, 100)} ms`;

async function inChunks(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += PARALLEL) {
    out.push(...(await Promise.all(items.slice(i, i + PARALLEL).map(fn))));
  }
  return out;
}

async function waitFor(cond, what, ms = TIMEOUT) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
    if (cond()) return;
  }
  throw new Error(`Timeout nach ${ms} ms: ${what}`);
}

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

const ts = Math.floor(Date.now() / 1000);
const { createEvent: event } = await gql(
  orgToken,
  'mutation($i: CreateEventInput!) { createEvent(input: $i) { id slug } }',
  {
    i: {
      title: `E2E ${USERS} Teilnehmer`,
      slug: `e2e-${ts}`,
      scheduledDatetime: ts,
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

const loginMs = [];
const users = await inChunks([...Array(USERS).keys()], async (i) => {
  const n = i + 1;
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
  // Erster Login setzt das Passwort (argon2-Hash)
  const start = now();
  const token = await login({
    loginType: 'event-user',
    username: u.username,
    password: randomUUID(),
    eventId: event.id,
    displayName: `E2E ${n}`,
  });
  loginMs.push(now() - start);
  return { ...u, token, events: [] };
});
step(`${USERS} Teilnehmer angelegt und eingeloggt (Login ${stats(loginMs)})`);

const clients = users.map((u) => {
  const client = createClient({
    url: `${API.replace(/^http/, 'ws')}/graphql`,
    webSocketImpl: WebSocket,
    connectionParams: { authorization: `Bearer ${u.token}` },
    retryAttempts: 0,
  });
  client.subscribe(
    {
      query:
        'subscription($e: ID) { pollLifeCycle(eventId: $e) { state pollResultId poll { id possibleAnswers { id content } } } }',
      variables: { e: event.id },
    },
    {
      next: ({ data }) => u.events.push({ ...data.pollLifeCycle, at: now() }),
      error: (e) => u.events.push({ state: 'error', e: String(e?.message || e) }),
      complete: () => {},
    }
  );
  return client;
});
await new Promise((r) => setTimeout(r, Math.max(1500, USERS * 5))); // Subscriptions registrieren lassen
step(`${USERS} WebSocket-Subscriptions offen`);

const pollStart = now();
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
const got = (state) => users.filter((u) => u.events.some((e) => e.state === state)).length;
await waitFor(() => got('new') === USERS, `"new" bei allen (${got('new')}/${USERS})`);
const fanout = users.map((u) => u.events.find((e) => e.state === 'new').at - pollStart);
step(
  `Poll ${poll.id} gestartet, "new" bei allen ${USERS} per WebSocket (Fan-out ${stats(fanout)})`
);

const ja = poll.possibleAnswers.find((a) => a.content === 'Ja');
const voteMs = [];
const votesStart = now();
await inChunks(users, async (u) => {
  const start = now();
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
  voteMs.push(now() - start);
});
const votesSec = (now() - votesStart) / 1000;
step(
  `${USERS} Stimmen in ${votesSec.toFixed(1)} s, ${(USERS / votesSec).toFixed(0)}/s (je Stimme ${stats(voteMs)})`
);

// Bei voller Beteiligung schließt der Server die Abstimmung selbst; sonst manuell
await new Promise((r) => setTimeout(r, 1500));
if (got('closed') < USERS) {
  await gql(orgToken, 'mutation($id: ID!) { stopPoll(id: $id) }', { id: poll.id });
}
await waitFor(() => got('closed') === USERS, `"closed" bei allen (${got('closed')}/${USERS})`);
step('Abstimmung geschlossen, "closed" per WebSocket bei allen angekommen');

const { pollResult } = await gql(
  orgToken,
  'query($e: ID) { pollResult(eventId: $e, page: 0, pageSize: 10, includeHidden: true) { closed poll { id } pollAnswer { answerContent } } }',
  { e: event.id }
);
const result = pollResult.find((r) => r.poll.id === poll.id);
const jaCount = result?.pollAnswer.filter((a) => a.answerContent === 'Ja').length;
if (!result?.closed || jaCount !== USERS)
  throw new Error(`Ergebnis falsch: ${jaCount}/${USERS} Ja, closed=${result?.closed}`);
step(`Ergebnis korrekt: ${jaCount}× Ja, Poll geschlossen`);

const errors = users.flatMap((u) => u.events.filter((e) => e.state === 'error'));
if (errors.length) throw new Error(`Subscription-Fehler: ${JSON.stringify(errors.slice(0, 3))}`);
await Promise.all(clients.map((c) => c.dispose()));
console.log(`\nE2E OK (${USERS} Teilnehmer)`);
