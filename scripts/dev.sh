#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing oasis-web dependencies..."
cd "$REPO_ROOT/oasis-web" && bun install

echo "Installing oasis-api dependencies..."
cd "$REPO_ROOT/oasis-api" && bun install

echo "Starting services..."
docker compose -f "$REPO_ROOT/docker-compose.yml" up --build
