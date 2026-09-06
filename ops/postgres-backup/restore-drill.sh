#!/bin/sh

set -eu

if [ "${CONFIRM_RESTORE_DRILL:-}" != "RESTORE_TO_NON_PRODUCTION" ]; then
  echo "Restore aborted: set CONFIRM_RESTORE_DRILL=RESTORE_TO_NON_PRODUCTION." >&2
  exit 1
fi

if [ -z "${TARGET_DATABASE_URL:-}" ] || [ -z "${BACKUP_FILE:-}" ]; then
  echo "Restore aborted: TARGET_DATABASE_URL and BACKUP_FILE are required." >&2
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  echo "Restore aborted: BACKUP_FILE does not exist or is empty." >&2
  exit 1
fi

expected_database="restore_drill"
actual_database="$(psql "$TARGET_DATABASE_URL" --no-psqlrc --tuples-only --no-align --command='SELECT current_database();')"

if [ "$actual_database" != "$expected_database" ]; then
  echo "Restore aborted: target database is '$actual_database', expected '$expected_database'." >&2
  exit 1
fi

existing_tables="$(psql "$TARGET_DATABASE_URL" --no-psqlrc --tuples-only --no-align --command="SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"

if [ "$existing_tables" != "0" ]; then
  echo "Restore aborted: target database is not empty." >&2
  exit 1
fi

pg_restore --list "$BACKUP_FILE" >/dev/null

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Starting restore drill at ${started_at}."

pg_restore \
  --dbname="$TARGET_DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --exit-on-error \
  "$BACKUP_FILE"

psql "$TARGET_DATABASE_URL" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --command="SELECT count(*) AS public_tables FROM pg_tables WHERE schemaname = 'public';" \
  --command="SELECT count(*) AS applied_migrations FROM app_migrations;"

echo "Restore drill completed. Perform the application checks from RUNBOOK.md before removing the temporary database."
