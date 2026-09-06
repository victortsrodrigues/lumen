FROM postgres:18.6-alpine3.24

RUN apk add --no-cache aws-cli ca-certificates su-exec nodejs

COPY backup.sh /usr/local/bin/lumen-postgres-backup
COPY restore-drill.sh /usr/local/bin/lumen-restore-drill
COPY restore-from-r2.sh /usr/local/bin/lumen-restore-from-r2
COPY verify-restored-data.mjs /usr/local/bin/lumen-verify-restored-data.mjs
RUN chmod 0555 /usr/local/bin/lumen-postgres-backup /usr/local/bin/lumen-restore-drill /usr/local/bin/lumen-restore-from-r2

CMD ["/usr/local/bin/lumen-postgres-backup"]
