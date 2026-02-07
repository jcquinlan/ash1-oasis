#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Stopping containers..."
docker compose -f "$REPO_ROOT/docker-compose.yml" down

echo "Removing Postgres data..."
rm -rf "$REPO_ROOT/data/postgres"

echo "Rebuilding and starting services..."
docker compose -f "$REPO_ROOT/docker-compose.yml" up --build
