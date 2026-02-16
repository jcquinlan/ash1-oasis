---
model: 'opus'
disable-model-invocation: true
---

# /harness - Autonomous PRD-Driven Work

Activate harness mode to decompose work into small PRDs with testable acceptance criteria, then execute them sequentially. The stop hook keeps Claude working until all PRDs pass.

## Usage

```
/harness "Build feature X with technology Y"
```

## Arguments

$ARGUMENTS = the work description provided by the user

## Instructions

You have been invoked via `/harness`. Follow these steps exactly:

### Step 1: Initialize

Create the `.harness/` directory if it doesn't exist:

```bash
mkdir -p .harness
```

### Step 2: Create a Feature Branch

Always perform harness work on a new branch off of `master`. Generate a short, kebab-case branch name from the work description (e.g., `harness/add-user-auth`, `harness/fix-dashboard-metrics`).

```bash
git checkout master
git pull --ff-only origin master 2>/dev/null || true
git checkout -b harness/<descriptive-slug>
```

- The branch name **must** start with `harness/`
- Keep the slug to 3-5 words max
- If the branch already exists (e.g., re-running the harness for the same task), check it out instead of creating a new one

### Step 3: Delegate to Planner

Launch the planner subagent to decompose the work into PRDs:

```
Task(subagent_type="general-purpose", prompt="<planner instructions>")
```

Use the planner agent file at `.claude/agents/planner.md`. Pass it the following prompt:

```
Read the planner instructions at .claude/agents/planner.md and follow them exactly.

Work description: $ARGUMENTS

Working directory: <current working directory>
```

### Step 4: Review the Plan

After the planner completes, read `.harness/progress.json` and present a summary to the user:

- List each NEW PRD (skip already-completed ones) with its title and acceptance criteria
- Show the total count: "X new PRDs added (Y previously completed)"
- Do NOT ask for approval — begin execution immediately

### Step 5: Execute PRDs

Process PRDs in order. For each PRD with status `pending`:

1. **Read** `.harness/progress.json` to get the current state
2. **Update status** to `in_progress` and increment `iteration` counter
3. **Log** a `prd_started` event
4. **Implement** the PRD according to its description and acceptance criteria
5. **Run the test command** specified in the PRD's `test_command` field
6. **If tests pass**:
   - Update PRD status to `done`
   - Log a `prd_done` event
   - Commit the work: `git add -A && git commit -m "prd-XXX: <title>"`
7. **If tests fail**:
   - Increment the PRD's `attempts` counter
   - Store the error in `last_error`
   - If attempts >= `config.max_prd_attempts`: mark as `failed`, log `prd_failed`
   - Otherwise: try to fix and re-run (stay on same PRD)
8. **Move to the next pending PRD**

### Step 6: Updating progress.json

When updating `.harness/progress.json`, always use this pattern to ensure atomic writes:

```bash
jq '<your jq expression>' .harness/progress.json > .harness/progress.tmp && mv .harness/progress.tmp .harness/progress.json
```

Common updates:

**Mark PRD as in_progress:**
```bash
jq '(.prds[] | select(.id == "prd-001")).status = "in_progress" | .iteration += 1' .harness/progress.json > .harness/progress.tmp && mv .harness/progress.tmp .harness/progress.json
```

**Mark PRD as done:**
```bash
jq '(.prds[] | select(.id == "prd-001")).status = "done"' .harness/progress.json > .harness/progress.tmp && mv .harness/progress.tmp .harness/progress.json
```

**Add log entry:**
```bash
jq '.log += [{"timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'", "event": "prd_done", "prd_id": "prd-001"}]' .harness/progress.json > .harness/progress.tmp && mv .harness/progress.tmp .harness/progress.json
```

### Step 7: Circuit Breakers

Before starting each PRD, check:

- **Global iteration limit**: If `.iteration >= .config.max_total_iterations`, stop immediately and output a summary
- **Per-PRD attempt limit**: If a PRD's `.attempts >= .config.max_prd_attempts`, mark it `failed` and move on

### Step 8: Completion

When no more `pending` or `in_progress` PRDs remain, output a final summary:

```
## Harness Complete

**Done**: X PRDs
**Failed**: Y PRDs (list titles)
**Total iterations**: Z

<brief summary of what was accomplished>
```

The stop hook will detect no remaining PRDs and allow Claude to stop normally.
