#!/bin/sh

set -eu
umask 077

required_variables="DATABASE_URL S3_ENDPOINT BACKUP_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY"

for variable_name in $required_variables; do
  eval "variable_value=\${$variable_name:-}"
  if [ -z "$variable_value" ]; then
    echo "Backup aborted: required variable $variable_name is missing or empty." >&2
    exit 1
  fi
done

case "$S3_ENDPOINT" in
  https://*) ;;
  *)
    echo "Backup aborted: S3_ENDPOINT must use HTTPS." >&2
    exit 1
    ;;
esac

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
export AWS_EC2_METADATA_DISABLED=true

backup_prefix="${BACKUP_PREFIX:-lumen/postgres/weekly}"
monthly_backup_prefix="${MONTHLY_BACKUP_PREFIX:-lumen/postgres/monthly}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
calendar_day="$(date -u +%d)"
calendar_weekday="$(date -u +%w)"
backup_name="lumen-postgres-${timestamp}.dump"
temporary_directory="$(mktemp -d)"
backup_path="${temporary_directory}/${backup_name}"
checksum_path="${backup_path}.sha256"

cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting PostgreSQL backup at ${timestamp}."

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$backup_path"

if [ ! -s "$backup_path" ]; then
  echo "Backup aborted: pg_dump produced an empty file." >&2
  exit 1
fi

pg_restore --list "$backup_path" >/dev/null
(
  cd "$temporary_directory"
  sha256sum "$backup_name" > "${backup_name}.sha256"
)

upload_and_verify() {
  object_key="$1"

  aws s3 cp \
    "$backup_path" \
    "s3://${BACKUP_BUCKET}/${object_key}" \
    --endpoint-url "$S3_ENDPOINT" \
    --only-show-errors

  aws s3 cp \
    "$checksum_path" \
    "s3://${BACKUP_BUCKET}/${object_key}.sha256" \
    --endpoint-url "$S3_ENDPOINT" \
    --only-show-errors

  aws s3api head-object \
    --bucket "$BACKUP_BUCKET" \
    --key "$object_key" \
    --endpoint-url "$S3_ENDPOINT" >/dev/null

  aws s3api head-object \
    --bucket "$BACKUP_BUCKET" \
    --key "${object_key}.sha256" \
    --endpoint-url "$S3_ENDPOINT" >/dev/null

  echo "Backup uploaded and verified: ${object_key}."
}

upload_and_verify "${backup_prefix}/${backup_name}"

# The weekly cron runs on Sundays; retain the first Sunday's dump as monthly too.
if [ "$calendar_weekday" = "0" ] && [ "$calendar_day" -le 7 ]; then
  upload_and_verify "${monthly_backup_prefix}/${backup_name}"
fi

backup_size="$(wc -c < "$backup_path" | tr -d ' ')"
echo "Backup completed successfully (${backup_size} bytes)."
