#!/usr/bin/env bash
# =============================================================================
# Reset Development Database
# =============================================================================
# DEVELOPMENT ONLY — destroys and recreates the local Postgres data directory.
# This script refuses to run if it detects a production environment.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ---------------------------------------------------------------------------
# Production safety check
# ---------------------------------------------------------------------------
# Block execution if any production signal is detected:
#   - NODE_ENV=production in environment
#   - Production compose file is the active stack
#   - The oasis-pgdata named volume exists (production uses named volumes)
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "FATAL: NODE_ENV is 'production'. This script is for development only." >&2
  exit 1
fi

if docker compose -f "$REPO_ROOT/docker-compose.prod.yml" ps --quiet oasis 2>/dev/null | grep -q .; then
  echo "FATAL: Production containers are running. This script is for development only." >&2
  echo "If you really need to reset production, do it manually with a backup first." >&2
  exit 1
fi

if docker volume inspect oasis-pgdata >/dev/null 2>&1; then
  echo "FATAL: Named volume 'oasis-pgdata' exists — this looks like a production host." >&2
  echo "This script only resets the development bind-mount at ./data/postgres." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Confirmation prompt
# ---------------------------------------------------------------------------
echo "WARNING: This will destroy ALL data in the development database."
echo "Data directory: $REPO_ROOT/data/postgres"
printf "Type 'yes' to continue: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------
echo "Stopping containers..."
docker compose -f "$REPO_ROOT/docker-compose.yml" down

echo "Removing Postgres data..."
rm -rf "$REPO_ROOT/data/postgres"

echo "Rebuilding and starting services..."
docker compose -f "$REPO_ROOT/docker-compose.yml" up --build
