#!/usr/bin/env bash
# Prüft SEC-09/17 (REST ohne Login) sowie SEC-10/11/12/15/16/19/20/25/26/31-34/44/45 gegen eine LOKALE API.
# Aufruf: API=http://localhost:4000 ORG_USER=org ORG_PASS=… OWN_EVENT=1 FOREIGN_EVENT=2 \
#   [SUPER_USER=super SUPER_PASS=…] [EXPECT_PROD=1] [MAIL_FILE=…/mails.txt RESET_USER=…] scripts/check-rest-auth.sh
# Schreibt nur lokal: optional ein Test-Upload (SUPER_USER) und ein Reset-Token für RESET_USER.
set -u
API=${API:-http://localhost:4000}
[[ $API =~ ^https?://(localhost|127\.0\.0\.1)(:|/|$) ]] || { echo "nur gegen localhost"; exit 2; }
fail=0
expect() { # name, erwarteter Code, curl-Args...
  local name=$1 want=$2; shift 2
  local got; got=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  if [[ $got == "$want" ]]; then echo "ok   $name ($got)"; else echo "FAIL $name: erwartet $want, bekommen $got"; fail=1; fi
}
J=(-H 'Content-Type: application/json')

# SEC-09: leerer bzw. Objekt-Hash darf kein Konto treffen
for h in '""' '{"hash":1}'; do
  body=$(curl -s -X POST "$API/organizer/update-password" "${J[@]}" -d "{\"hash\":$h,\"password\":\"x\",\"passwordRepeat\":\"x\"}")
  [[ $body == *'"success":true'* ]] && { echo "FAIL SEC-09 hash=$h: $body"; fail=1; } || echo "ok   SEC-09 hash=$h abgelehnt"
done

# SEC-17: ohne Token
expect "export-results ohne Token" 401 -X POST "$API/event/export-results" "${J[@]}" -d "{\"eventId\":$OWN_EVENT,\"exportType\":\"pollOverview\"}"
expect "vote-adjustments ohne Token" 401 "$API/event/$OWN_EVENT/export-vote-adjustments"
expect "media/upload ohne Token" 401 -X POST "$API/media/upload"
expect "cleanup ohne Token" 401 -X POST "$API/cleanup"
expect "zoom/auth/token ohne Token" 401 -X POST "$API/zoom/auth/token" "${J[@]}" -d '{}'
expect "Groß/Klein-Variante ohne Token" 401 -X POST "$API/Event/Export-Results" "${J[@]}" -d "{\"eventId\":$OWN_EVENT,\"exportType\":\"pollOverview\"}"
expect "Trailing Slash ohne Token" 401 -X POST "$API/cleanup/"

# öffentliche Routen bleiben offen (kein 401)
for r in "POST /event/verify-slug" "POST /organizer/password-forgot" "GET /event/$OWN_EVENT" "POST /login/refresh"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X ${r%% *} "$API${r#* }" "${J[@]}" -d '{}')
  [[ $code != 401 ]] && echo "ok   öffentlich ${r} ($code)" || { echo "FAIL öffentlich ${r} gibt 401"; fail=1; }
done

# SEC-17: mit Organizer-Token
TOKEN=$(curl -s -X POST "$API/login" "${J[@]}" -d "{\"loginType\":\"organizer\",\"username\":\"$ORG_USER\",\"password\":\"$ORG_PASS\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[[ -n $TOKEN ]] || { echo "FAIL Login"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN")
expect "export-results eigenes Event" 200 -X POST "$API/event/export-results" "${J[@]}" "${A[@]}" -d "{\"eventId\":$OWN_EVENT,\"exportType\":\"pollOverview\"}"
expect "export-results fremdes Event" 403 -X POST "$API/event/export-results" "${J[@]}" "${A[@]}" -d "{\"eventId\":$FOREIGN_EVENT,\"exportType\":\"pollOverview\"}"
expect "vote-adjustments fremdes Event" 403 "${A[@]}" "$API/event/$FOREIGN_EVENT/export-vote-adjustments"
expect "cleanup als Nicht-Super-Admin" 403 -X POST "${A[@]}" "$API/cleanup"
expect "gefälschter Token" 401 -X POST "$API/cleanup" -H "Authorization: Bearer ${TOKEN}x"


# --- GraphQL (SEC-15) ---
G="$API/graphql"
gql() { # token, query -> Antwort-JSON
  local auth=(); [[ -n $1 ]] && auth=(-H "Authorization: Bearer $1")
  curl -s -X POST "$G" "${J[@]}" "${auth[@]}" -d "$(node -e 'console.log(JSON.stringify({query: process.argv[1]}))' "$2")"
}
expect_body() { # name, Muster (grep -E), Text
  if grep -qE -- "$2" <<<"$3"; then echo "ok   $1"; else echo "FAIL $1: ${3:0:200}"; fail=1; fi
}
expect "GraphQL ohne Token (nicht öffentlich)" 401 -X POST "$G" "${J[@]}" -d '{"query":"{ organizers { id } }"}'
expect "GraphQL ohne Token (öffentlich)" 200 -X POST "$G" "${J[@]}" -d '{"query":"{ systemSettings { id } }"}'
expect_body "organizers als Organizer verboten" 'Not authorized' "$(gql "$TOKEN" '{ organizers { id hash password } }')"
expect_body "fremdes event() verboten" 'Not authorized' "$(gql "$TOKEN" "{ event(id: $FOREIGN_EVENT, organizerId: 3) { id } }")"
expect_body "eventUsers fremdes Event verboten" 'Not authorized' "$(gql "$TOKEN" "{ eventUsers(eventId: $FOREIGN_EVENT) { id username } }")"
expect_body "pollResult fremdes Event verboten" 'Not authorized' "$(gql "$TOKEN" "{ pollResult(eventId: $FOREIGN_EVENT, includeHidden: true) { id } }")"
expect_body "activePollEventUser fremdes Event verboten" 'Not authorized' "$(gql "$TOKEN" "{ activePollEventUser(eventId: $FOREIGN_EVENT) { state } }")"
expect_body "upcomingEvents fremder Organizer verboten" 'Not authorized' "$(gql "$TOKEN" '{ upcomingEvents(organizerId: 3) { id } }')"
expect_body "pollCacheStats verboten" 'Not authorized' "$(gql "$TOKEN" '{ pollCacheStats { activeTimers } }')"
expect_body "eigenes event() erlaubt" '"event":\{"id"' "$(gql "$TOKEN" "{ event(id: $OWN_EVENT, organizerId: 1) { id } }")"
expect_body "eigener organizer: hash/password null" '"password":null,"hash":null' "$(gql "$TOKEN" '{ organizer(organizerId: 1) { id password hash } }')"
expect_body "Query zu tief (SEC-34)" 'too deep' "$(gql "$TOKEN" '{ organizer(organizerId: 1) { events { organizer { events { organizer { events { organizer { events { organizer { events { id } } } } } } } } } } }')"
intro=$(gql "$TOKEN" '{ __schema { queryType { name } } }')
if [[ ${EXPECT_PROD:-0} == 1 ]]; then
  expect_body "Introspection in Produktion aus (SEC-33)" 'introspection' "$intro"
  expect "GraphiQL in Produktion aus" 406 -H "Accept: text/html" "${A[@]}" "$API/graphql"
else
  echo "info Introspection (nicht-Produktion): ${intro:0:80}"
fi

# Event-User-Token (Lobby von OWN_EVENT muss offen sein, sonst übersprungen)
EU=$(curl -s -X POST "$API/login" "${J[@]}" -d "{\"loginType\":\"event-user\",\"username\":\"sec-check-$RANDOM$RANDOM\",\"password\":\"pw-$RANDOM$RANDOM\",\"displayName\":\"Sec Check\",\"eventId\":$OWN_EVENT}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [[ -n $EU ]]; then
  expect_body "Event-User: eventUsers fremdes Event verboten" 'Not authorized' "$(gql "$EU" "{ eventUsers(eventId: $FOREIGN_EVENT) { id } }")"
  expect_body "Event-User: eventUsers eigenes Event verboten" 'Not authorized' "$(gql "$EU" "{ eventUsers(eventId: $OWN_EVENT) { id } }")"
  expect_body "Event-User: organizers verboten" 'Not authorized' "$(gql "$EU" '{ organizers { hash } }')"
  expect_body "Event-User: polls fremdes Event verboten" 'Not authorized' "$(gql "$EU" "{ polls(eventId: $FOREIGN_EVENT) { id } }")"
  expect_body "Event-User: polls eigenes Event erlaubt" '"polls":' "$(gql "$EU" "{ polls(eventId: $OWN_EVENT) { id } }")"
  expect "zoom/auth/token Organizer verboten (SEC-19)" 403 -X POST "$API/zoom/auth/token" "${J[@]}" "${A[@]}" -d '{"role":1}'
else
  echo "info Event-User-Login auf Event $OWN_EVENT nicht möglich (Lobby zu?) – Event-User-Checks übersprungen"
fi

# --- JWT-Laufzeit (SEC-25) ---
life=$(node -e 'const p=JSON.parse(Buffer.from(process.argv[1].split(".")[1],"base64url"));console.log(p.exp-p.iat)' "$TOKEN")
[[ $life -le 900 ]] && echo "ok   JWT-Laufzeit ${life}s" || { echo "FAIL JWT-Laufzeit ${life}s"; fail=1; }

# --- WebSocket (SEC-16/45) ---
ws=$(API=$API TOKEN=$TOKEN node --input-type=module -e '
import { createClient } from "graphql-ws"; import WebSocket from "ws";
const url = process.env.API.replace(/^http/, "ws") + "/graphql";
const run = (params, query, origin) => new Promise((resolve) => {
  class WS extends WebSocket { constructor(a, b) { super(a, b, origin ? { headers: { origin } } : {}); } }
  const c = createClient({ url, webSocketImpl: WS, connectionParams: params, retryAttempts: 0, lazy: true,
    on: { closed: (e) => resolve("closed:" + e.code) } });
  c.subscribe({ query }, { next: (d) => { resolve("data:" + JSON.stringify(d).slice(0, 80)); c.dispose(); },
    error: (e) => { resolve("error:" + JSON.stringify(e).slice(0, 120)); c.dispose(); }, complete: () => {} });
  setTimeout(() => resolve("timeout"), 4000);
});
const sub = "subscription { pollLifeCycle(eventId: 1) { state } }";
console.log("noToken=" + await run({}, sub));
console.log("fakeToken=" + await run({ authorization: "Bearer " + process.env.TOKEN + "x" }, sub));
console.log("query=" + await run({ authorization: "Bearer " + process.env.TOKEN }, "{ organizers { hash } }"));
console.log("evilOrigin=" + await run({ authorization: "Bearer " + process.env.TOKEN }, sub, "https://evil.example"));
' 2>&1)
expect_body "WS ohne Token abgelehnt" 'noToken=closed:4403' "$ws"
expect_body "WS mit gefälschtem Token abgelehnt" 'fakeToken=closed:4403' "$ws"
expect_body "WS: Query statt Subscription abgelehnt" 'query=error:.*Only subscriptions' "$ws"
expect_body "WS: fremder Origin abgelehnt" 'evilOrigin=closed:(1006|4403|1002)' "$ws"

# --- CORS (SEC-26) ---
acao=$(curl -s -D - -o /dev/null -X OPTIONS "$API/login" -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' | grep -i '^access-control-allow-origin' || true)
[[ -z $acao ]] && echo "ok   CORS: fremder Origin ohne ACAO" || { echo "FAIL CORS spiegelt fremden Origin: $acao"; fail=1; }
ck=$(curl -s -D - -o /dev/null -X POST "$API/login" "${J[@]}" -d "{\"loginType\":\"organizer\",\"username\":\"$ORG_USER\",\"password\":\"$ORG_PASS\"}" | grep -i '^set-cookie: refreshToken')
expect_body "Refresh-Cookie HttpOnly+Secure+SameSite" 'HttpOnly.*Secure.*SameSite=Strict|Secure.*HttpOnly.*SameSite=Strict|HttpOnly; Secure; SameSite=Strict' "$ck"

# --- Logout-CSRF (SEC-44) ---
expect "Logout von fremder Seite" 403 -H 'Sec-Fetch-Site: cross-site' "$API/logout"

# --- Event-Daten öffentlich (SEC-17 Rest / MAGIC-1) ---
ev=$(curl -s "$API/event/$OWN_EVENT")
if grep -qE 'videoConferenceConfig|sdkSecret|sdk_secret|"createDatetime"|organizerId' <<<"$ev"; then echo "FAIL GET /event/:id liefert interne Felder: ${ev:0:200}"; fail=1; else echo "ok   GET /event/:id ohne Secrets/createDatetime"; fi

# --- password-forgot / Reset (SEC-10/11/12/38) ---
expect_body "password-forgot unbekannter Nutzer = gleiche Antwort" '"success":true' "$(curl -s -X POST "$API/organizer/password-forgot" "${J[@]}" -d '{"username":"gibt-es-nicht-xyz"}')"
expect_body "validate-hash ohne Datensatz in der Antwort" '^\{"error":"The given hash is not valid.","success":false\}$' "$(curl -s -X POST "$API/organizer/validate-hash" "${J[@]}" -d "{\"hash\":\"$(printf 'a%.0s' {1..64})\"}")"
if [[ -n ${MAIL_FILE:-} && -n ${RESET_USER:-} ]]; then
  : > "$MAIL_FILE"
  curl -s -o /dev/null -X POST "$API/organizer/password-forgot" "${J[@]}" -H 'Origin: https://evil.example' -d "{\"username\":\"$RESET_USER\"}"
  sleep 2
  link=$(tr -d '\r' < "$MAIL_FILE" | sed -e ':a;/=$/{N;s/=\n//;ba}' | grep -oE 'https?://[^" <]*passwort-aendern/[a-f0-9]+' | head -1)
  [[ -n $link && $link != *evil* ]] && echo "ok   Reset-Link aus CLIENT_BASE_URL: ${link%/*}/…" || { echo "FAIL Reset-Link: '$link'"; fail=1; }
  tok=${link##*/}
  [[ ${#tok} == 64 ]] && echo "ok   Reset-Token 256 Bit" || { echo "FAIL Reset-Token-Länge ${#tok}"; fail=1; }
  expect_body "Reset: Passwort-Policy" 'mindestens' "$(curl -s -X POST "$API/organizer/update-password" "${J[@]}" -d "{\"hash\":\"$tok\",\"password\":\"kurz\",\"passwordRepeat\":\"kurz\"}")"
  NEWPW="Reset-$RANDOM-Pass!"
  expect_body "Reset mit Token" '"success":true' "$(curl -s -X POST "$API/organizer/update-password" "${J[@]}" -d "{\"hash\":\"$tok\",\"password\":\"$NEWPW\",\"passwordRepeat\":\"$NEWPW\"}")"
  expect_body "Reset-Token nur einmal" '"success":false' "$(curl -s -X POST "$API/organizer/update-password" "${J[@]}" -d "{\"hash\":\"$tok\",\"password\":\"$NEWPW\",\"passwordRepeat\":\"$NEWPW\"}")"
fi

# --- Upload (SEC-20) ---
if [[ -n ${SUPER_USER:-} ]]; then
  ST=$(curl -s -X POST "$API/login" "${J[@]}" -d "{\"loginType\":\"organizer\",\"username\":\"$SUPER_USER\",\"password\":\"$SUPER_PASS\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  expect_body "organizers als Super-Admin: hash/password null" '"password":null,"hash":null' "$(gql "$ST" '{ organizers { id password hash } }')"
  tmp=$(mktemp -d)
  printf '<html><script>alert(localStorage["apollo-token"])</script></html>' > "$tmp/x.html"
  printf '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' > "$tmp/x.svg"
  printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x06\0\0\0\x1f\x15\xc4\x89\0\0\0\rIDATx\x9cc\xf8\x0f\0\x01\x01\x01\0\x18\xdd\x8d\xb4\0\0\0\0IEND\xaeB`\x82' > "$tmp/ok.png"
  expect "Upload als Organizer ohne CMS-Recht" 403 -X POST "$API/media/upload" "${A[@]}" -F "file=@$tmp/ok.png;type=image/png"
  expect "Upload HTML als image/png" 400 -X POST "$API/media/upload" -H "Authorization: Bearer $ST" -F "file=@$tmp/x.html;type=image/png;filename=x.png"
  expect "Upload SVG" 400 -X POST "$API/media/upload" -H "Authorization: Bearer $ST" -F "file=@$tmp/x.svg;type=image/svg+xml"
  up=$(curl -s -X POST "$API/media/upload" -H "Authorization: Bearer $ST" -F "file=@$tmp/ok.png;type=image/png;filename=evil.html")
  url=$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' <<<"$up")
  [[ $url == /uploads/images/*.png ]] && echo "ok   PNG-Upload, Endung serverseitig ($url)" || { echo "FAIL PNG-Upload: $up"; fail=1; }
  hdr=$(curl -s -D - -o /dev/null "$API$url")
  expect_body "uploads: nosniff" 'X-Content-Type-Options: nosniff' "$hdr"
  expect_body "uploads: CSP sandbox" 'Content-Security-Policy: .*sandbox' "$hdr"
  rm -rf "$tmp"
fi

exit $fail
