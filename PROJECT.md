# Project Name
Ash1 Cleanup

## Tech Stack

- **Runtime**: Bun (all services)
- **Frontend**: React 18 + TypeScript + Vite 6 + React Router 7
- **Backend**: Hono v4 (HTTP framework on Bun)
- **Database**: PostgreSQL 16 (via `postgres` driver for app queries, Kysely for Better Auth)
- **Authentication**: Better Auth v1 (email/password, session-based)
- **Rich Text**: Tiptap v3 (journal editor with markdown support)
- **LLM**: Anthropic SDK (Claude API for project step generation)
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions → GHCR → SSH deploy
- **Production**: Nginx (frontend), Bun (API), PostgreSQL 16

## Requirements

Perform a deep clean of the codebase, as a means of onboarding the new agent harness.
Look for high-level improvements to the codebase, in terms of security, polish, techdebt, functionality, etc.
Choose a couple to implement.

Selected cleanup targets:

1. **API Input Validation** — Add Zod schema validation to all POST/PUT endpoints. Currently the API casts `req.json()` with `as` and trusts whatever arrives. This is the single biggest code quality gap.
2. **CORS Lockdown** — The CORS middleware accepts any origin (`origin || '*'`) with `credentials: true`. Lock to the production domain (`jamescq.com`) and localhost for dev.
3. **Add user_id to journal entries and projects** — Neither entity tracks ownership. Any authenticated user can modify any record. Add ownership FK and enforce it in API routes.
4. **Remove dead metrics tables** — `app.container_metrics` and `app.system_metrics` are never written to. Drop the tables and the `01-init.sql` migration contents to reduce confusion.
5. **Clean up LLM integration** — Extract hardcoded model name (`claude-sonnet-4-5-20250929`) to an env var. Add proper error handling to the `/api/projects/generate-steps` endpoint.

## Non-Requirements

- No new features (no new pages, no new API domains, no new services)
- No Kubernetes migration or infrastructure changes
- No frontend redesign or UI overhaul
- No migration away from current tech stack (Bun, Hono, Better Auth)
- No changes to the CI/CD pipeline structure (GitHub Actions → GHCR → SSH)
- Do not add a logging framework (desirable but out of scope for cleanup)
- Do not add React Query/SWR — the current fetch-in-hooks pattern is fine for this scale

## Architecture

### Directory Structure

```
ash1-oasis/
├── oasis-web/                 # React frontend
│   ├── src/
│   │   ├── pages/             # Route page components (7 pages)
│   │   ├── components/        # Auth guards (RequireAuth)
│   │   ├── hooks/             # Data fetching hooks (useTheme, useJournal, useProjects)
│   │   ├── ui/                # Reusable UI components (13 components)
│   │   ├── lib/               # Auth client config
│   │   ├── Layout.tsx          # Root layout with nav
│   │   └── main.tsx           # React Router setup
│   ├── Dockerfile / Dockerfile.dev
│   ├── nginx.conf             # Production static serving
│   └── vite.config.ts
├── oasis-api/                 # Hono API server
│   ├── src/
│   │   ├── index.ts           # All routes + middleware (~643 lines)
│   │   └── auth.ts            # Better Auth config
│   ├── Dockerfile / Dockerfile.dev
│   └── package.json
├── scripts/
│   ├── db/init/               # Idempotent SQL migrations (5 files)
│   ├── backup-postgres.sh     # Daily backup scheduler
│   └── dev.sh                 # Dev utilities
├── docker-compose.yml         # Development (HMR enabled)
├── docker-compose.prod.yml    # Production (pre-built images)
└── .github/workflows/deploy.yml  # CI/CD pipeline
```

### Key Patterns

- **API routing**: All routes in a single `index.ts` file. Protected routes use `requireAuth` middleware that checks Better Auth sessions.
- **Data access split**: Better Auth uses Kysely adapter. All application queries (journal, projects, system) use raw `postgres` template literals with parameterized queries.
- **Frontend data fetching**: Custom hooks (`useJournal`, `useProjects`) wrap `fetch()` calls. No caching layer — data re-fetches on component mount.
- **System monitoring**: API shells out to `docker ps`, `cat /proc/*`, `df` via `Bun.spawn()` and parses stdout. Fragile but functional.
- **Migrations**: All SQL in `scripts/db/init/` must be idempotent (see CLAUDE.md for patterns). Run by `oasis-migrations` container on every `docker compose up`.
- **Soft deletes**: Projects and steps use `deleted_at` timestamp. Journal entries use hard deletes. Queries must include `WHERE deleted_at IS NULL`.
- **Fail loudly**: Per CLAUDE.md — prefer crashing over silent defaults, health checks must verify real dependencies, CI must use `set -euo pipefail`.

### Data Model

```
auth.user
  - id (TEXT PK)
  - name (TEXT)
  - email (TEXT UNIQUE)
  - emailVerified (BOOLEAN)
  - image (TEXT)
  - createdAt / updatedAt (TIMESTAMP)

auth.session
  - id (TEXT PK)
  - token (TEXT UNIQUE)
  - expiresAt (TIMESTAMP)
  - userId (FK → auth.user)
  - ipAddress, userAgent (TEXT)

auth.account
  - id (TEXT PK)
  - providerId, accountId (TEXT)
  - userId (FK → auth.user)
  - password (TEXT) — hashed
  - accessToken, refreshToken, etc.

auth.verification
  - id (TEXT PK)
  - identifier, value (TEXT)
  - expiresAt (TIMESTAMP)

journal.entries
  - id (SERIAL PK)
  - title (VARCHAR 255)
  - content (TEXT) — raw HTML from Tiptap
  - is_public (BOOLEAN DEFAULT false)
  - created_at / updated_at (TIMESTAMP)
  ⚠ No user_id FK — ownership not tracked

projects.projects
  - id (SERIAL PK)
  - title (VARCHAR 255)
  - description (TEXT)
  - status (VARCHAR 50: active|paused|completed|archived)
  - meta (JSONB)
  - created_at / updated_at / deleted_at (TIMESTAMP)
  ⚠ No user_id FK — ownership not tracked

projects.steps
  - id (SERIAL PK)
  - project_id (FK → projects.projects)
  - parent_id (FK → self, nullable) — tree structure
  - title (VARCHAR 255)
  - description (TEXT)
  - status (VARCHAR 50: pending|active|completed|skipped)
  - sort_order (INTEGER)
  - meta (JSONB)
  - created_at / updated_at / completed_at / deleted_at (TIMESTAMP)

app.container_metrics  ⚠ DEAD TABLE — never written to
app.system_metrics     ⚠ DEAD TABLE — never written to
```

**Relationships:**
- auth.user 1──∞ auth.session
- auth.user 1──∞ auth.account
- projects.projects 1──∞ projects.steps
- projects.steps 1──∞ projects.steps (self-referencing tree via parent_id)
- journal.entries — standalone (no FK to users)

### API Design

**Base path**: `/api`
**Auth**: Better Auth handles `/api/auth/*` (signup, signin, signout, session). Protected routes use `requireAuth` middleware → 401 if no valid session.
**Response format**: JSON. Success returns data directly. Errors return `{ error: "message" }`.

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `*` | `/api/auth/*` | Public | Better Auth handler |
| `GET` | `/api/health` | Public | Health check (currently superficial) |
| `GET` | `/api/containers` | Protected | Docker container status |
| `GET` | `/api/system` | Protected | System metrics from /proc |
| `GET` | `/api/journal` | Visibility | List entries (anon: public only) |
| `GET` | `/api/journal/:id` | Visibility | Single entry (visibility-aware) |
| `POST` | `/api/journal` | Protected | Create entry |
| `PUT` | `/api/journal/:id` | Protected | Update entry |
| `DELETE` | `/api/journal/:id` | Protected | Delete entry |
| `GET` | `/api/projects` | Protected | List projects (filter by status) |
| `GET` | `/api/projects/:id` | Protected | Project with steps |
| `POST` | `/api/projects` | Protected | Create project |
| `PUT` | `/api/projects/:id` | Protected | Update project |
| `DELETE` | `/api/projects/:id` | Protected | Soft-delete project + steps |
| `POST` | `/api/projects/:id/steps` | Protected | Add steps |
| `PUT` | `/api/projects/:id/steps/:stepId` | Protected | Update step |
| `DELETE` | `/api/projects/:id/steps/:stepId` | Protected | Soft-delete step + children |
| `PUT` | `/api/projects/:id/steps` | Protected | Batch reorder steps |
| `POST` | `/api/projects/generate-steps` | Protected | LLM step generation (Claude) |

**Known issues:**
- No request body validation (Zod or similar)
- No rate limiting on auth endpoints
- CORS accepts any origin with credentials

## Constraints

- All PRDs must have test coverage associated with the functionality of the PRD. This can include unit tests and/or browser tests via Playwright.
- All database migrations must be idempotent (see CLAUDE.md for required patterns).
- Changes must not break the existing CI/CD deploy pipeline.
- Follow the "fail loudly" principle — no silent failures, no swallowed errors.
- Preserve backwards compatibility with existing production data.
- Use Bun's built-in test runner (`bun test`) for unit tests. Add Playwright only if E2E tests are needed.

## Open Questions

- ~~Is this a single-user application?~~ **Decided:** Adding user_id FKs — treating as multi-user capable.
- ~~Which cleanup areas should be prioritized?~~ **Decided:** API validation, CORS lockdown, user ownership, dead table removal.
- ~~Should the dead metrics tables be wired up or dropped?~~ **Decided:** Drop them.
- ~~What is the production domain for CORS lockdown?~~ **Decided:** `jamescq.com` (from vite.config.ts).
- ~~What test framework preference?~~ **Decided:** `bun test` for unit tests, Playwright for E2E if needed.
- ~~Is the Anthropic/Claude integration in scope?~~ **Decided:** Yes — extract hardcoded model name to env var, add error handling.

## Reference

- `CLAUDE.md` — Project conventions, migration patterns, "fail loudly" philosophy
- `oasis-api/src/index.ts` — All API routes and middleware (~643 lines)
- `oasis-api/src/auth.ts` — Better Auth configuration
- `oasis-web/src/main.tsx` — Frontend routing setup
- `scripts/db/init/` — All 5 migration files (01-init through 05-auth)
- `.github/workflows/deploy.yml` — CI/CD pipeline (build → deploy → health check)
- `docker-compose.yml` / `docker-compose.prod.yml` — Dev and prod orchestration
