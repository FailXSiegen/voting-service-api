// Angriffs-Prüfskript für die Stimmabgabe (SEC-01/02/03/04/06/07/08 aus dem Audit 2026-11-07).
// Legt ein eigenes Test-Event mit Teilnehmern und Abstimmungen an, führt die Angriffe aus und
// prüft danach über das Ergebnis, dass die Stimmenzahl stimmt. Nur gegen localhost erlaubt.
//
//   API=http://localhost:4001 ORG_USER=org ORG_PASS=… ORG_ID=1 SUPER_USER=super SUPER_PASS=… \
//     node scripts/check-vote-integrity.mjs
//
// Zusätzlich: SEC-23 (votingDetailsUpdate liefert bei geheimer Abstimmung keine Einzelstimmen),
// SEC-29 (Abstimmung/Stimmgewicht nach Stimmabgabe gesperrt), SEC-30 (parallele Stimmübertragungen).
//
// Exit-Code 0 = alle Angriffe abgewehrt, 1 = mindestens ein Angriff erfolgreich.
import { randomUUID } from 'node:crypto';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';

const API = process.env.API || 'http://localhost:4001';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API)) {
  console.error(`nur gegen localhost (API=${API})`);
  process.exit(2);
}
const { ORG_USER, ORG_PASS, ORG_ID } = process.env;
const SUPER_USER = process.env.SUPER_USER || 'super';
const SUPER_PASS = process.env.SUPER_PASS || ORG_PASS;
if (!ORG_USER || !ORG_PASS || !ORG_ID) {
  console.error('ORG_USER/ORG_PASS/ORG_ID fehlen');
  process.exit(2);
}

let failed = 0;
const ok = (msg) => console.log(`ok   ${msg}`);
const fail = (msg) => {
  failed++;
  console.log(`FAIL ${msg}`);
};
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

async function login(body) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Login ${body.loginType} ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
}

// Liefert { data, errors } ohne zu werfen – Angriffe sollen Fehler bekommen.
async function gqlRaw(token, query, variables) {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function gql(token, query, variables) {
  const json = await gqlRaw(token, query, variables);
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const SINGLE = 'mutation($i: PollSubmitAnswerInput!) { createPollSubmitAnswer(input: $i) }';
const BULK = 'mutation($i: BulkPollSubmitAnswerInput!) { createBulkPollSubmitAnswer(input: $i) }';
const MULTI =
  'mutation($i: MultiPollSubmitAnswerInput!) { createMultiPollSubmitAnswer(input: $i) }';

const single = (u, pollId, answer, extra = {}) =>
  gqlRaw(u.token, SINGLE, {
    i: {
      pollId,
      eventUserId: u.id,
      type: 'SECRET',
      answerContent: answer.content,
      possibleAnswerId: answer.id,
      voteCycle: 1,
      answerItemLength: 1,
      answerItemCount: 1,
      multivote: false,
      isLastAnswerInBallot: true,
      ...extra,
    },
  });
const bulk = (u, pollId, possibleAnswerId, answerContent, voteCount, type = 'SECRET', token) =>
  gqlRaw(token || u.token, BULK, {
    i: { pollId, eventUserId: u.id, type, possibleAnswerId, answerContent, voteCount },
  });
const multi = (u, pollId, answers, voteCount = 1, type = 'SECRET') =>
  gqlRaw(u.token, MULTI, {
    i: {
      pollId,
      eventUserId: u.id,
      type,
      answers: answers.map((a) => ({
        possibleAnswerId: a.id,
        answerContent: a.content,
        voteCount,
      })),
    },
  });

const orgToken = await login({ loginType: 'organizer', username: ORG_USER, password: ORG_PASS });
const superToken = await login({
  loginType: 'organizer',
  username: SUPER_USER,
  password: SUPER_PASS,
});

const ts = Math.floor(Date.now() / 1000);
async function createEvent(suffix) {
  const { createEvent: event } = await gql(
    orgToken,
    'mutation($i: CreateEventInput!) { createEvent(input: $i) { id slug } }',
    {
      i: {
        title: `Vote-Integrity ${suffix}`,
        slug: `vote-integrity-${suffix}-${ts}`,
        scheduledDatetime: ts,
        organizerId: ORG_ID,
        lobbyOpen: true,
        active: true,
        multivoteType: 1,
        async: false,
        allowMagicLink: false,
        publicVoteVisible: false,
        videoConferenceConfig: '{}',
        styles: '',
        logo: '',
        description: '',
      },
    }
  );
  return event;
}

async function createUser(eventId, name, voteAmount, allowToVote = true) {
  const { createEventUser: u } = await gql(
    orgToken,
    'mutation($i: CreateEventUserInput!) { createEventUser(input: $i) { id username } }',
    {
      i: {
        eventId,
        username: `${name}-${ts}`,
        publicName: name,
        verified: true,
        allowToVote,
        voteAmount,
      },
    }
  );
  const token = await login({
    loginType: 'event-user',
    username: u.username,
    password: randomUUID(),
    eventId,
    displayName: name,
  });
  return { ...u, token };
}

async function createPoll(
  eventId,
  title,
  { type = 'SECRET', min = 1, max = 1, start = true } = {}
) {
  const { createPoll: poll } = await gql(
    orgToken,
    'mutation($i: CreateNewPollInput!, $s: Boolean!) { createPoll(input: $i, instantStart: $s) { id possibleAnswers { id content } } }',
    {
      s: start,
      i: {
        eventId,
        title,
        type,
        pollAnswer: 'custom',
        list: '',
        possibleAnswers: [{ content: 'A' }, { content: 'B' }, { content: 'C' }],
        minVotes: min,
        maxVotes: max,
        allowAbstain: false,
      },
    }
  );
  const [A, B, C] = poll.possibleAnswers;
  return { ...poll, A, B, C };
}

// Schließt die laufende Abstimmung und liefert deren Antworten.
async function closeAndCount(eventId, poll) {
  const { activePollEventUser: active } = await gql(
    orgToken,
    'query($e: ID) { activePollEventUser(eventId: $e) { pollResultId poll { id } } }',
    { e: eventId }
  );
  if (active?.pollResultId && String(active.poll?.id) === String(poll.id)) {
    await gql(orgToken, 'mutation($id: ID!) { stopPoll(id: $id) }', { id: active.pollResultId });
  }
  const { pollResult } = await gql(
    orgToken,
    'query($e: ID) { pollResult(eventId: $e, page: 0, pageSize: 50, includeHidden: true) { closed poll { id } pollAnswer { answerContent pollUserId } } }',
    { e: eventId }
  );
  const result = pollResult.find((r) => String(r.poll.id) === String(poll.id));
  return result?.pollAnswer || [];
}

const eventA = await createEvent('a');
const eventB = await createEvent('b');
// idle stimmt nie ab – verhindert, dass der Server die Abstimmung selbst schließt.
const idle = await createUser(eventA.id, 'idle', 1);
const u1 = await createUser(eventA.id, 'u1', 1);
const u3 = await createUser(eventA.id, 'u3', 3);
const guest = await createUser(eventA.id, 'guest', 1, false);
const uB = await createUser(eventB.id, 'uB', 1);
console.log(`Event A ${eventA.id}, Event B ${eventB.id}`);
const foreignPoll = await createPoll(eventB.id, 'Fremd', { start: false });

// SEC-01: Mehrfachsenden mit answerItemCount < answerItemLength
{
  const p = await createPoll(eventA.id, 'SEC-01');
  for (let i = 0; i < 5; i++) {
    await single(u1, p.id, p.A, { answerItemCount: 1, answerItemLength: 2 });
  }
  for (let i = 0; i < 3; i++) {
    await single(guest, p.id, p.A, { answerItemCount: 1, answerItemLength: 2 });
  }
  const answers = await closeAndCount(eventA.id, p);
  check(
    answers.length === 1,
    `SEC-01 5× count<length (1 Stimme) + Gast ohne Stimmrecht → ${answers.length} Stimmen (soll 1)`
  );
}

// SEC-02: fremdes Event, fremde possibleAnswerId
{
  const p = await createPoll(eventA.id, 'SEC-02');
  await single(uB, p.id, p.A);
  await bulk(uB, p.id, p.A.id, 'A', 1);
  await bulk(u1, p.id, foreignPoll.A.id, 'A', 1);
  await multi(u3, p.id, [foreignPoll.A], 1);
  const answers = await closeAndCount(eventA.id, p);
  check(
    answers.length === 0,
    `SEC-02 fremdes Event / fremde Antwort-ID → ${answers.length} Stimmen (soll 0)`
  );
}

// SEC-03: Duplikate im answers-Array, mehr Antworten als maxVotes
{
  const p = await createPoll(eventA.id, 'SEC-03', { max: 2 });
  await multi(u1, p.id, Array(10).fill(p.A), 1);
  await multi(u3, p.id, [p.A, p.B, p.C], 1);
  const legit = await multi(u3, p.id, [p.A, p.B], 1);
  const answers = await closeAndCount(eventA.id, p);
  check(
    answers.length === 2 && legit.data?.createMultiPollSubmitAnswer === 1,
    `SEC-03 10× dieselbe Antwort / 3 Antworten bei max 2 → ${answers.length} Stimmen (soll 2 aus legitimem Stimmzettel)`
  );
}

// SEC-04: 20 parallele Bulk-Requests mit voteCount = voteAmount
{
  const p = await createPoll(eventA.id, 'SEC-04');
  await Promise.all([
    ...Array.from({ length: 20 }, () => bulk(u3, p.id, p.A.id, 'A', 3)),
    ...Array.from({ length: 20 }, () => single(u1, p.id, p.B)),
    ...Array.from({ length: 10 }, () => multi(u1, p.id, [p.C], 1)),
  ]);
  const answers = await closeAndCount(eventA.id, p);
  const a = answers.filter((x) => x.answerContent === 'A').length;
  const bc = answers.length - a;
  check(
    answers.length === 4 && a === 3,
    `SEC-04 20 parallele Bulk (3 Stimmen) + 30 parallele Einzel/Multi (1 Stimme) → ${a}+${bc} Stimmen (soll 3+1)`
  );
}

// SEC-06: SQL-Payload in possibleAnswerId und answerContent
{
  const p = await createPoll(eventA.id, 'SEC-06');
  const sub = `(SELECT id FROM poll_result WHERE poll_id = ${Number(p.id)} LIMIT 1)`;
  await bulk(u1, p.id, `${p.A.id}, 0x78, 0), (${sub}, ${p.A.id}`, 'A', 1);
  await bulk(u3, p.id, p.A.id, `x\\', 0), (${sub}, NULL, 0x79, 0) -- `, 1);
  const answers = await closeAndCount(eventA.id, p);
  const contents = [...new Set(answers.map((x) => x.answerContent))];
  check(
    answers.length === 1 && contents.length === 1 && contents[0] === 'A',
    `SEC-06 SQL in possibleAnswerId/answerContent → ${answers.length} Stimmen, Inhalte ${JSON.stringify(contents)} (soll 1× "A")`
  );
}

// SEC-07 + SEC-08: Typ aus dem Client, Super-Admin stimmt für Wähler
{
  const p = await createPoll(eventA.id, 'SEC-07 geheim');
  await bulk(u1, p.id, p.A.id, 'A', 1, 'PUBLIC');
  const asSuper = await bulk(u3, p.id, p.A.id, 'A', 3, 'SECRET', superToken);
  const answers = await closeAndCount(eventA.id, p);
  check(
    answers.length === 1 && answers.every((x) => !x.pollUserId),
    `SEC-07 type=PUBLIC bei geheimer Abstimmung → pollUserId ${JSON.stringify(answers.map((x) => x.pollUserId))} (soll null)`
  );
  check(
    Boolean(asSuper.errors?.length) && !asSuper.data?.createBulkPollSubmitAnswer,
    `SEC-08 Super-Admin stimmt für Wähler → ${asSuper.errors ? 'abgelehnt' : `angenommen (${asSuper.data?.createBulkPollSubmitAnswer})`}`
  );

  const q = await createPoll(eventA.id, 'SEC-07 öffentlich', { type: 'PUBLIC' });
  await bulk(u1, q.id, q.A.id, 'A', 1, 'SECRET');
  const pub = await closeAndCount(eventA.id, q);
  check(
    pub.length === 1 && pub.every((x) => x.pollUserId),
    `SEC-07 type=SECRET bei öffentlicher Abstimmung → pollUserId ${JSON.stringify(pub.map((x) => x.pollUserId))} (soll gesetzt)`
  );
}

// SEC-23: Live-Details einer geheimen Abstimmung enthalten keine Einzelstimmen
{
  const updates = [];
  const ws = createClient({
    url: `${API.replace(/^http/, 'ws')}/graphql`,
    webSocketImpl: WebSocket,
    connectionParams: { authorization: `Bearer ${orgToken}` },
    retryAttempts: 0,
  });
  ws.subscribe(
    {
      query:
        'subscription($e: ID!) { votingDetailsUpdate(eventId: $e) { pollResultId poll { id type } pollAnswers { id answerContent } pollUserVoted { eventUserId } } }',
      variables: { e: eventA.id },
    },
    {
      next: (msg) => updates.push(msg),
      error: (e) => updates.push({ errors: [String(e)] }),
      complete: () => {},
    }
  );
  await new Promise((r) => setTimeout(r, 1000));
  const p = await createPoll(eventA.id, 'SEC-23');
  await bulk(u3, p.id, p.B.id, 'B', 2);
  await new Promise((r) => setTimeout(r, 2500));
  await closeAndCount(eventA.id, p);
  await ws.dispose();
  const mine = updates.filter(
    (u) => String(u.data?.votingDetailsUpdate?.poll?.id) === String(p.id)
  );
  const leaked = mine.some((u) => (u.data.votingDetailsUpdate.pollAnswers || []).length > 0);
  const errors = updates.filter((u) => u.errors);
  check(
    mine.length > 0 && !leaked && errors.length === 0,
    `SEC-23 votingDetailsUpdate geheim → ${mine.length} Updates, Einzelstimmen ${leaked ? 'SICHTBAR' : 'keine'}, Fehler ${errors.length}`
  );
}

// SEC-29: Abstimmung und Stimmgewicht nach Stimmabgabe gesperrt
{
  const p = await createPoll(eventA.id, 'SEC-29');
  await bulk(u3, p.id, p.A.id, 'A', 1);
  const upd = await gqlRaw(
    orgToken,
    'mutation($i: UpdatePollInput!) { updatePoll(input: $i, instantStart: false) { id } }',
    {
      i: {
        id: p.id,
        eventId: eventA.id,
        title: 'geändert',
        type: 'SECRET',
        pollAnswer: 'custom',
        list: '',
        possibleAnswers: [{ content: 'A' }],
        minVotes: 1,
        maxVotes: 1,
        allowAbstain: false,
      },
    }
  );
  const rem = await gqlRaw(orgToken, 'mutation($id: ID!) { removePoll(id: $id) }', { id: p.id });
  const weight = await gqlRaw(
    orgToken,
    'mutation($i: UpdateEventUserInput!) { updateEventUser(input: $i) { id voteAmount } }',
    {
      i: {
        id: u3.id,
        eventId: eventA.id,
        username: u3.username,
        verified: true,
        allowToVote: true,
        voteAmount: 10,
      },
    }
  );
  const answers = await closeAndCount(eventA.id, p);
  check(
    Boolean(upd.errors) && Boolean(rem.errors) && answers.length === 1,
    `SEC-29 updatePoll/removePoll nach Stimmabgabe → ${upd.errors ? 'abgelehnt' : 'ERLAUBT'}/${rem.errors ? 'abgelehnt' : 'ERLAUBT'}, Stimmen ${answers.length} (soll 1)`
  );
  check(
    Boolean(weight.errors),
    `SEC-29 Stimmgewicht ändern nach Stimmabgabe in laufender Abstimmung → ${weight.errors ? 'abgelehnt' : 'ERLAUBT'}`
  );
  // Nach Ende der Abstimmung ist es wieder erlaubt (Gegenprobe, setzt auf 3 zurück).
  const after = await gqlRaw(
    orgToken,
    'mutation($i: UpdateEventUserInput!) { updateEventUser(input: $i) { id voteAmount } }',
    {
      i: {
        id: u3.id,
        eventId: eventA.id,
        username: u3.username,
        verified: true,
        allowToVote: true,
        voteAmount: 3,
      },
    }
  );
  check(
    !after.errors,
    `SEC-29 Stimmgewicht nach Ende änderbar → ${after.errors ? JSON.stringify(after.errors) : 'ok'}`
  );
}

// SEC-30: 10 parallele Übertragungen von je 1 Stimme bei 3 Stimmen
{
  const transfer = () =>
    gqlRaw(orgToken, 'mutation($i: TransferVotesInput!) { transferVotes(input: $i) { success } }', {
      i: { sourceUserId: u3.id, targetUserId: idle.id, voteAmount: 1 },
    });
  const results = await Promise.all(Array.from({ length: 10 }, transfer));
  const succeeded = results.filter((r) => r.data?.transferVotes?.success).length;
  const users = await gql(orgToken, 'query($e: ID) { eventUsers(eventId: $e) { id voteAmount } }', {
    e: eventA.id,
  });
  const amount = (u) => users.eventUsers.find((x) => String(x.id) === String(u.id))?.voteAmount;
  check(
    succeeded === 3 && amount(u3) === 0 && amount(idle) === 4,
    `SEC-30 10 parallele Übertragungen → ${succeeded} erfolgreich, Quelle ${amount(u3)}, Ziel ${amount(idle)} (soll 3/0/4)`
  );
}

// SEC-23 direkt in der DB: geheime Stimmen ohne Zeitstempel und ohne Wählerbezug, auf jedem Abgabeweg.
// ponytail: liest den lokalen Dev-Container per docker exec; ohne Container wird die Prüfung übersprungen.
{
  const { execFileSync } = await import('node:child_process');
  // poll.type ist numerisch: 0 = SECRET, 1 = PUBLIC
  const sql = `SELECT COUNT(*), COALESCE(SUM(pa.create_datetime <> 0 OR pa.poll_user_id IS NOT NULL), 0)
    FROM poll_answer pa JOIN poll_result pr ON pr.id = pa.poll_result_id
    JOIN poll p ON p.id = pr.poll_id
    WHERE p.event_id = ${Number(eventA.id)} AND p.type = 0`;
  try {
    const [total, leaks] = execFileSync(
      'docker',
      ['exec', '-e', `MYSQL_PWD=${process.env.DB_PASS || ''}`, process.env.DB_CONTAINER || 'votingtool-dev-db',
        'mariadb', '-uroot', '-N', '-e', sql, process.env.DB_NAME || 'application'],
      { encoding: 'utf8' }
    ).trim().split('\t');
    check(Number(total) > 0 && leaks === '0', `SEC-23 DB: geheime Stimmen mit Zeitstempel/Wählerbezug: ${leaks} (soll 0, geprüft ${total})`);
  } catch (e) {
    console.log(`skip SEC-23 DB-Prüfung (${String(e.message).split('\n')[0]})`);
  }
}

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Angriffe abgewehrt');
process.exit(failed ? 1 : 0);
