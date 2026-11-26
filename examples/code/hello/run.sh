# Run this script while the hello worker is listening to check the whole pipeline.
# It starts a run for Ada, waits for it to settle, and prints the greeting from the run’s bag.

set -euo pipefail

floor() {
  curl -fsS -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
    -H 'Content-Type: application/json' "$@"
}

RUN=$(floor "$FLOOR_API_URL/assembly-lines/hello-world/start" \
  -d '{"startItems":{"name":{"kind":"value","ref":"Ada","by":"tutorial"}}}' | jq -er '.run.id')

for attempt in $(seq 1 30); do
  result=$(floor "$FLOOR_API_URL/assembly-runs/$RUN") || exit 1
  if jq -e '.run.outcome != null' >/dev/null <<<"$result"; then
    jq -er 'select(.run.outcome == "success") | .bag.greeting.ref' <<<"$result"
    exit $?
  fi
  sleep 1
done
echo "Run $RUN is still pending. Check that the hello worker is running." >&2
exit 1
