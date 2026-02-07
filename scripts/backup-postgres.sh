#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Backup Script
# =============================================================================
# Creates timestamped pg_dump backups and rotates old ones.
#
# Usage:
#   ./scripts/backup-postgres.sh                    # Uses defaults
#   BACKUP_DIR=/mnt/backups ./scripts/backup-postgres.sh  # Custom location
#   KEEP_DAYS=30 ./scripts/backup-postgres.sh             # Custom retention
#
# Designed to run:
#   - As a cron job via the oasis-backup container
#   - Manually before risky operations
#   - From the CI/CD pipeline before migrations
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PGHOST="${PGHOST:-oasis}"
PGUSER="${POSTGRES_USER:?POSTGRES_USER must be set}"
PGDATABASE="${POSTGRES_DB:?POSTGRES_DB must be set}"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/oasis-${TIMESTAMP}.sql.gz"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

if ! pg_isready -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -q; then
  echo "FATAL: PostgreSQL is not reachable at ${PGHOST}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
echo "Starting backup: ${BACKUP_FILE}"

pg_dump \
  -h "$PGHOST" \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip > "$BACKUP_FILE"

# Verify the file is non-empty (a zero-byte gzip means pg_dump produced nothing)
if [ ! -s "$BACKUP_FILE" ]; then
  echo "FATAL: Backup file is empty — pg_dump likely failed" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# Rotation — delete backups older than KEEP_DAYS
# ---------------------------------------------------------------------------
DELETED=0
while IFS= read -r old_backup; do
  rm -f "$old_backup"
  DELETED=$((DELETED + 1))
done < <(find "$BACKUP_DIR" -name "oasis-*.sql.gz" -mtime +"$KEEP_DAYS" -type f)

if [ "$DELETED" -gt 0 ]; then
  echo "Rotated ${DELETED} backup(s) older than ${KEEP_DAYS} days"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL="$(find "$BACKUP_DIR" -name "oasis-*.sql.gz" -type f | wc -l)"
echo "Total backups on disk: ${TOTAL}"
