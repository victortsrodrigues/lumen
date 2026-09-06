#!/bin/sh

set -eu
umask 077

if [ "${CONFIRM_RESTORE_DRILL:-}" != "RESTORE_TO_NON_PRODUCTION" ]; then
  echo "Restore aborted: explicit restore-drill confirmation is required." >&2
  exit 1
fi

for variable_name in S3_ENDPOINT BACKUP_BUCKET BACKUP_OBJECT_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  eval "variable_value=\${$variable_name:-}"
  if [ -z "$variable_value" ]; then
    echo "Restore aborted: $variable_name is missing or empty." >&2
    exit 1
  fi
done

case "$S3_ENDPOINT" in
  https://*) ;;
  *) echo "Restore aborted: S3_ENDPOINT must use HTTPS." >&2; exit 1 ;;
esac

backup_name="${BACKUP_OBJECT_KEY##*/}"
if ! printf '%s\n' "$backup_name" | grep -Eq '^lumen-postgres-[0-9]{8}T[0-9]{6}Z\.dump$'; then
  echo "Restore aborted: unexpected backup filename." >&2
  exit 1
fi

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
export AWS_EC2_METADATA_DISABLED=true
# This container never needs a production database connection.
unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE

drill_directory="$(mktemp -d /tmp/lumen-restore-drill.XXXXXX)"
postgres_started=false
cleanup() {
  if [ "$postgres_started" = true ]; then
    su-exec postgres pg_ctl -D "$drill_directory/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$drill_directory"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Downloading backup for isolated restore drill: $BACKUP_OBJECT_KEY"
aws s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_OBJECT_KEY}" "$drill_directory/$backup_name" \
  --endpoint-url "$S3_ENDPOINT" --only-show-errors
aws s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_OBJECT_KEY}.sha256" "$drill_directory/$backup_name.sha256" \
  --endpoint-url "$S3_ENDPOINT" --only-show-errors

# Require a checksum for precisely the selected file, without following paths
# contained in a downloaded manifest.
expected_checksum="$(awk 'NR == 1 { print $1 }' "$drill_directory/$backup_name.sha256")"
if ! printf '%s\n' "$expected_checksum" | grep -Eq '^[0-9a-f]{64}$'; then
  echo "Restore aborted: invalid checksum manifest." >&2
  exit 1
fi
actual_checksum="$(sha256sum "$drill_directory/$backup_name" | awk '{ print $1 }')"
if [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "Restore aborted: downloaded backup checksum does not match." >&2
  exit 1
fi
echo "Downloaded backup checksum verified."

mkdir "$drill_directory/socket"
chown postgres:postgres "$drill_directory" "$drill_directory/socket"
su-exec postgres initdb -D "$drill_directory/data" --auth-local=trust --auth-host=reject --no-instructions >/dev/null
# No TCP listener: this temporary database is only accessible in this container.
su-exec postgres pg_ctl -D "$drill_directory/data" -l "$drill_directory/postgres.log" \
  -o "-h '' -k $drill_directory/socket -p 55432" -w start >/dev/null
postgres_started=true
createdb --host="$drill_directory/socket" --port=55432 --username=postgres restore_drill

export TARGET_DATABASE_URL="postgresql://postgres@localhost/restore_drill?host=$drill_directory/socket&port=55432"
export BACKUP_FILE="$drill_directory/$backup_name"
/usr/local/bin/lumen-restore-drill

psql "$TARGET_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --command="SELECT 'users' AS entity, count(*) FROM users UNION ALL SELECT 'members', count(*) FROM members UNION ALL SELECT 'events', count(*) FROM events UNION ALL SELECT 'notifications', count(*) FROM notifications;" \
  --command="SELECT role, status, count(*) FROM users GROUP BY role, status ORDER BY role, status;"
node /usr/local/bin/lumen-verify-restored-data.mjs

echo "Isolated R2 restore drill passed. Temporary database will be removed on exit."
