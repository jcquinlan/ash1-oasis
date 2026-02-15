#!/usr/bin/env bash
# Stop hook for the agent harness.
# Blocks Claude from stopping when there are pending PRDs to work on.
# No-op (exits 0) when no harness work is active.

set -euo pipefail

PROGRESS_FILE=".harness/progress.json"

# --- No-op conditions (allow stop) ---

# No progress file = not harnessed
if [ ! -f "$PROGRESS_FILE" ]; then
  exit 0
fi

# jq is required for parsing
if ! command -v jq &> /dev/null; then
  echo "Warning: jq not found, cannot check harness state" >&2
  exit 0
fi

# Validate JSON
if ! jq empty "$PROGRESS_FILE" 2>/dev/null; then
  echo "Warning: progress.json is invalid JSON" >&2
  exit 0
fi

# --- Read state ---

ITERATION=$(jq -r '.iteration // 0' "$PROGRESS_FILE")
MAX_ITERATIONS=$(jq -r '.config.max_total_iterations // 30' "$PROGRESS_FILE")
MAX_ATTEMPTS=$(jq -r '.config.max_prd_attempts // 3' "$PROGRESS_FILE")

PENDING=$(jq '[.prds[] | select(.status == "pending")] | length' "$PROGRESS_FILE")
IN_PROGRESS=$(jq '[.prds[] | select(.status == "in_progress")] | length' "$PROGRESS_FILE")
REMAINING=$((PENDING + IN_PROGRESS))

TOTAL=$(jq '.prds | length' "$PROGRESS_FILE")
DONE=$(jq '[.prds[] | select(.status == "done")] | length' "$PROGRESS_FILE")
FAILED=$(jq '[.prds[] | select(.status == "failed")] | length' "$PROGRESS_FILE")

# --- Circuit breaker: global iteration limit ---

if [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
  echo "Circuit breaker: reached max iterations ($MAX_ITERATIONS). Allowing stop." >&2
  exit 0
fi

# --- No remaining work = allow stop ---

if [ "$REMAINING" -eq 0 ]; then
  exit 0
fi

# --- Block stop: there is work remaining ---

# Find the next pending PRD
NEXT_PRD_ID=$(jq -r '[.prds[] | select(.status == "pending")][0].id // empty' "$PROGRESS_FILE")
NEXT_PRD_TITLE=$(jq -r '[.prds[] | select(.status == "pending")][0].title // empty' "$PROGRESS_FILE")

# If nothing pending but something in_progress, show that instead
if [ -z "$NEXT_PRD_ID" ]; then
  NEXT_PRD_ID=$(jq -r '[.prds[] | select(.status == "in_progress")][0].id // empty' "$PROGRESS_FILE")
  NEXT_PRD_TITLE=$(jq -r '[.prds[] | select(.status == "in_progress")][0].title // empty' "$PROGRESS_FILE")
fi

cat <<EOF
HARNESS ACTIVE - Do not stop. Continue working on PRDs.

Progress: $DONE done, $FAILED failed, $REMAINING remaining (of $TOTAL total)
Iteration: $ITERATION / $MAX_ITERATIONS

Next PRD: $NEXT_PRD_ID - $NEXT_PRD_TITLE

Read .harness/progress.json for full details and continue implementing the next pending PRD.
EOF

exit 2
