#!/usr/bin/env bash
# Supabase Free Plan keep-alive.
#
# Performs a read-only SELECT against public.site_settings through the
# Supabase REST API (PostgREST) using the public anon / publishable key.
# site_settings is readable by the `anon` role under the existing RLS policy
# "public read settings" (USING true), so no schema/RLS changes are needed.
#
# Required env vars:
#   SUPABASE_URL       e.g. https://<project-ref>.supabase.co
#   SUPABASE_ANON_KEY  legacy anon JWT (eyJ...) or publishable key (sb_publishable_...)
set -euo pipefail

TABLE="site_settings"
QUERY="select=key&limit=1"

fail() {
  echo "::error title=Supabase keep-alive failed::$*"
  exit 1
}

# ---------- validate inputs ----------
[[ -n "${SUPABASE_URL:-}" ]]      || fail "SUPABASE_URL secret is missing or empty."
[[ -n "${SUPABASE_ANON_KEY:-}" ]] || fail "SUPABASE_ANON_KEY secret is missing or empty."

BASE_URL="${SUPABASE_URL%/}"
[[ "$BASE_URL" =~ ^https://[^/]+$ ]] \
  || fail "SUPABASE_URL must look like https://<project-ref>.supabase.co (no path)."

KEY="$SUPABASE_ANON_KEY"

# ---------- refuse privileged keys ----------
if [[ "$KEY" == sb_secret_* ]]; then
  fail "SUPABASE_ANON_KEY contains a secret key (sb_secret_...). Use the anon/publishable key instead."
fi

AUTH_HEADER=()
if [[ "$KEY" == eyJ* ]]; then
  # Legacy JWT key: decode the payload and make sure it is not service_role.
  payload="$(cut -d. -f2 <<<"$KEY" | tr '_-' '/+')"
  while (( ${#payload} % 4 )); do payload+="="; done
  decoded="$(base64 -d 2>/dev/null <<<"$payload" || true)"
  if grep -Eq '"role"[[:space:]]*:[[:space:]]*"service_role"' <<<"$decoded"; then
    fail "SUPABASE_ANON_KEY is a service_role key. Never use it here; use the anon key."
  fi
  AUTH_HEADER=(-H "Authorization: Bearer $KEY")
fi
# New publishable keys (sb_publishable_...) are not JWTs and go in the apikey header only.

# ---------- run the query ----------
ENDPOINT="$BASE_URL/rest/v1/$TABLE?$QUERY"
echo "Querying: $ENDPOINT"

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

set +e
HTTP_STATUS="$(curl --silent --show-error \
  --max-time 30 --retry 3 --retry-delay 10 --retry-all-errors \
  --output "$BODY_FILE" --write-out '%{http_code}' \
  -H "apikey: $KEY" \
  "${AUTH_HEADER[@]}" \
  -H "Accept: application/json" \
  "$ENDPOINT")"
CURL_EXIT=$?
set -e

echo "HTTP status: ${HTTP_STATUS:-none}"

if (( CURL_EXIT != 0 )); then
  fail "Network error calling Supabase (curl exit code $CURL_EXIT). Check SUPABASE_URL and whether the project is paused."
fi

BODY="$(cat "$BODY_FILE")"

case "$HTTP_STATUS" in
  200) ;;
  401|403)
    echo "Response body: $BODY"
    fail "Authentication/permission error ($HTTP_STATUS). Check that SUPABASE_ANON_KEY is the current anon/publishable key for this project." ;;
  404)
    echo "Response body: $BODY"
    fail "Endpoint or table '$TABLE' not found (404). Check SUPABASE_URL." ;;
  5*)
    echo "Response body: $BODY"
    fail "Supabase server error ($HTTP_STATUS). The project may be paused or restoring; check the Supabase dashboard." ;;
  *)
    echo "Response body: $BODY"
    fail "Unexpected HTTP status $HTTP_STATUS." ;;
esac

# A successful PostgREST select always returns a JSON array.
if [[ "$BODY" != \[* ]]; then
  echo "Response body: $BODY"
  fail "HTTP 200 but response was not a JSON array; the query result could not be verified."
fi

if [[ "$BODY" == "[]" ]]; then
  echo "::warning::Query succeeded but $TABLE returned no rows (database activity was still generated)."
else
  echo "Query succeeded: read 1 row from public.$TABLE."
fi
echo "Supabase keep-alive OK at $(date -u +%Y-%m-%dT%H:%M:%SZ)."
