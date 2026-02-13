#!/bin/sh
set -euo pipefail

# =============================================================================
# PostgreSQL Backup Script
# =============================================================================
# Creates a timestamped pg_dump of the oasis database.
# Keeps the last 7 daily backups, pruning older ones.
#
# Expected environment variables:
#   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
#
# Usage:
#   As a one-shot backup (from host via compose exec):
#     docker compose -f docker-compose.prod.yml exec oasis pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql
#
#   From within the backup container:
#     /scripts/backup-postgres.sh
# =============================================================================

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/oasis_${TIMESTAMP}.sql.gz"
KEEP_DAYS=7

export PGPASSWORD="${POSTGRES_PASSWORD}"

echo "Starting backup: ${BACKUP_FILE}"
pg_dump -h oasis -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"

if [ -s "${BACKUP_FILE}" ]; then
  SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "Backup complete: ${BACKUP_FILE} (${SIZE})"
else
  echo "ERROR: Backup file is empty!" >&2
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Prune backups older than KEEP_DAYS
PRUNED=0
find "${BACKUP_DIR}" -name "oasis_*.sql.gz" -mtime +${KEEP_DAYS} -print -delete | while read -r f; do
  echo "Pruned old backup: ${f}"
  PRUNED=$((PRUNED + 1))
done

echo "Backup finished at $(date)"
