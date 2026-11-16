#!/usr/bin/env bash
#
# Nightly Postgres backup for the Lashes By Retha backend. Runs on the
# server that actually hosts the database (not Render - its free Postgres
# plan has no shell access to run pg_dump or cron against it), and reports
# every run - success or failure - back to the backend so the sysadmin
# Backups page always knows when the last good backup was.
#
# Required environment (export these, or set them on the crontab line):
#   DATABASE_URL          same connection string the backend itself uses
#   BACKUP_REPORT_TOKEN   must match the backend's BACKUP_REPORT_TOKEN env var
#   REPORT_URL            the backend's report endpoint, e.g.
#                         https://api.hairbyher.co.za/api/system/backups/report
#
# Optional:
#   BACKUP_DIR    where backups are kept (default /var/backups/hairbyher)
#   KEEP          how many recent backups to keep on disk (default 14)
#   RCLONE_REMOTE an rclone remote:path to also copy the backup to, e.g.
#                 "b2:hairbyher-backups" - if unset, offsite copying is
#                 skipped quietly (not treated as a failure)
#
# Crontab example (daily at 02:15, logging to a file for later reading):
#   15 2 * * * DATABASE_URL=postgresql://... BACKUP_REPORT_TOKEN=... \
#     REPORT_URL=https://api.hairbyher.co.za/api/system/backups/report \
#     /path/to/backup.sh >> /var/log/hairbyher-backup.log 2>&1

# Deliberately not using `set -e` - a failure partway through (pg_dump,
# rclone, whatever) must still reach the "report the result" step at the
# bottom, so the Backups page finds out about it instead of just going
# quiet. `set -u` still catches a typo'd/unset variable early.
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/hairbyher}"
KEEP="${KEEP:-14}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
FILENAME="hairbyher-${TIMESTAMP}.dump.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "$BACKUP_DIR"

STATUS="ok"
MESSAGE=""
SIZE_BYTES=0

# 1. Dump the database and compress it.
#    --format=custom is pg_dump's own compressed format - the only one that
#    supports selective/parallel restore later with pg_restore - and
#    piping that through gzip adds a second, fully portable layer on top
#    that's easy to move, checksum or inspect with ordinary tools.
if pg_dump --format=custom "$DATABASE_URL" | gzip > "$FILEPATH"; then
  SIZE_BYTES=$(stat -c%s "$FILEPATH" 2>/dev/null || stat -f%z "$FILEPATH" 2>/dev/null || echo 0)
else
  STATUS="failed"
  MESSAGE="pg_dump failed"
  rm -f "$FILEPATH"
fi

# 2. Keep only the most recent $KEEP backups on disk - delete the rest.
if [ "$STATUS" = "ok" ]; then
  # shellcheck disable=SC2012
  ls -1t "${BACKUP_DIR}"/hairbyher-*.dump.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f
fi

# 3. Optionally copy offsite with rclone. Skipped quietly - not a failure -
#    when RCLONE_REMOTE isn't set or rclone isn't installed; offsite
#    copying is a nice-to-have on top of the local retention above, not a
#    requirement for this script to count as a successful backup.
if [ "$STATUS" = "ok" ] && [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  if ! rclone copy "$FILEPATH" "$RCLONE_REMOTE" >/dev/null 2>&1; then
    MESSAGE="backup ok, but offsite copy to ${RCLONE_REMOTE} failed"
  fi
fi

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 4. Report the result to the backend, authenticated with the shared
#    BACKUP_REPORT_TOKEN - this is the only thing the sysadmin Backups page
#    actually reads. A failed report is logged here but never changes this
#    script's own exit code - there's nothing more to retry at that point.
if [ -n "${MESSAGE}" ]; then
  MESSAGE_JSON="\"$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')\""
else
  MESSAGE_JSON="null"
fi

if [ -n "${REPORT_URL:-}" ] && [ -n "${BACKUP_REPORT_TOKEN:-}" ]; then
  curl -fsS -X POST "$REPORT_URL" \
    -H "Authorization: Bearer ${BACKUP_REPORT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"startedAt\":\"${STARTED_AT}\",\"finishedAt\":\"${FINISHED_AT}\",\"status\":\"${STATUS}\",\"sizeBytes\":${SIZE_BYTES},\"location\":\"${FILEPATH}\",\"message\":${MESSAGE_JSON}}" \
    || echo "Warning: failed to report backup result to ${REPORT_URL}"
else
  echo "Warning: REPORT_URL or BACKUP_REPORT_TOKEN not set - skipping report"
fi

if [ "$STATUS" = "failed" ]; then
  echo "Backup failed: ${MESSAGE}" >&2
  exit 1
fi

echo "Backup complete: ${FILEPATH} (${SIZE_BYTES} bytes)"
