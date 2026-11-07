#!/usr/bin/env bash
# Prüft SEC-09 (leerer Reset-Hash) und SEC-17 (REST ohne Login) gegen eine LOKALE API.
# Aufruf: API=http://localhost:4000 ORG_USER=org ORG_PASS=… OWN_EVENT=1 FOREIGN_EVENT=2 scripts/check-rest-auth.sh
# Schreibt nichts (update-password mit ungültigem Hash ändert nichts).
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

exit $fail
