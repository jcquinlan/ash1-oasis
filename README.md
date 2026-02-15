# ash1-oasis

A homelab DevOps monorepo featuring a monitoring dashboard, journal, and project planner with AI-powered step generation.

## Project Structure

```
ash1-oasis/
├── oasis-web/              # React frontend
├── oasis-api/              # Hono API server
├── scripts/db/init/        # Idempotent PostgreSQL migrations (01-06)
├── .github/workflows/      # CI/CD pipeline
├── docker-compose.yml      # Development compose (HMR)
└── docker-compose.prod.yml # Production compose (GHCR images)
```

## Services

| Service | Description | Dev Port | Prod Port |
|---------|-------------|----------|-----------|
| `oasis` | PostgreSQL 16 database | 5432 | internal |
| `oasis-web` | React + Vite frontend | 3000 | 8081 |
| `oasis-api` | Hono API server | 3001 | 8082 |
| `oasis-migrations` | Runs SQL migrations on startup | — | — |
| `oasis-backup` | Daily pg_dump scheduler (prod) | — | — |

## Tech Stack

- **Runtime**: Bun
- **Frontend**: React 18 + TypeScript + Vite 6 + React Router 7
- **Backend**: Hono v4
- **Database**: PostgreSQL 16
- **Authentication**: Better Auth v1 (email/password, session-based)
- **Validation**: Zod v4 (all POST/PUT endpoints)
- **Rich Text**: Tiptap v3 (journal editor)
- **LLM**: Anthropic SDK (Claude API for project step generation)
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions → GHCR → SSH deploy

## Quick Start

### Prerequisites

- Docker and docker-compose
- (Optional) Bun for local development outside containers

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd ash1-oasis
   ```

2. Create environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. Start development environment:
   ```bash
   docker compose up
   ```

4. Access services:
   - Frontend: http://localhost:3000
   - API: http://localhost:3001

## Development

### Hot Module Reloading

- **Frontend**: Edit files in `oasis-web/src/` — changes reflect immediately
- **API**: Edit files in `oasis-api/src/` — server reloads automatically

### Running Tests

```bash
cd oasis-api && bun test
```

### Local Development Commands

#### Frontend (oasis-web/)
```bash
bun install      # Install dependencies
bun run dev      # Development server
bun run build    # Build for production
```

#### API (oasis-api/)
```bash
bun install      # Install dependencies
bun run dev      # Development with hot reload
bun run deploy   # Production build + run
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `POSTGRES_USER` | Yes | Database user (for containers) |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `POSTGRES_DB` | Yes | Database name |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret |
| `BETTER_AUTH_URL` | Yes | Base URL for auth callbacks |
| `ANTHROPIC_API_KEY` | No | Enables AI step generation |
| `ANTHROPIC_MODEL` | No | Override LLM model (default: claude-sonnet-4-5-20250929) |
| `CORS_ORIGINS` | No | Additional allowed origins (comma-separated) |

## Production Deployment

Production uses pre-built images from GitHub Container Registry:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Rollback to a specific version:
```bash
IMAGE_TAG=abc1234 docker compose -f docker-compose.prod.yml up -d
```

CI/CD is handled by GitHub Actions — pushes to `master` build images, push to GHCR, and deploy via SSH.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `*` | `/api/auth/*` | Public | Better Auth (signup, signin, signout) |
| `GET` | `/api/health` | Public | Health check |
| `GET` | `/api/containers` | Protected | Docker container status |
| `GET` | `/api/system` | Protected | System metrics (uptime, memory, load, disk) |
| `GET` | `/api/journal` | Visibility | List entries (anon: public only) |
| `GET` | `/api/journal/:id` | Visibility | Single entry |
| `POST` | `/api/journal` | Protected | Create entry |
| `PUT` | `/api/journal/:id` | Protected | Update entry (ownership enforced) |
| `DELETE` | `/api/journal/:id` | Protected | Delete entry (ownership enforced) |
| `GET` | `/api/projects` | Protected | List projects |
| `GET` | `/api/projects/:id` | Protected | Project with steps |
| `POST` | `/api/projects` | Protected | Create project |
| `PUT` | `/api/projects/:id` | Protected | Update project (ownership enforced) |
| `DELETE` | `/api/projects/:id` | Protected | Soft-delete project (ownership enforced) |
| `POST` | `/api/projects/:id/steps` | Protected | Add steps |
| `PUT` | `/api/projects/:id/steps/:stepId` | Protected | Update step |
| `DELETE` | `/api/projects/:id/steps/:stepId` | Protected | Soft-delete step + children |
| `PUT` | `/api/projects/:id/steps` | Protected | Batch reorder steps |
| `POST` | `/api/projects/generate-steps` | Protected | AI-powered step generation |

All POST/PUT endpoints validate request bodies with Zod schemas. Invalid input returns `400` with descriptive error messages.

## Database Migrations

Migrations live in `scripts/db/init/` and run automatically on every `docker compose up`. All SQL is idempotent — safe to re-run against an existing database.

| File | Description |
|------|-------------|
| `01-init.sql` | App schema, drops legacy metrics tables |
| `02-journal.sql` | Journal schema and entries table |
| `03-projects.sql` | Projects schema, projects + steps tables |
| `04-soft-deletes.sql` | Adds deleted_at columns for soft deletes |
| `05-auth.sql` | Better Auth tables (user, session, account, verification) |
| `06-ownership.sql` | Adds user_id FK to journal entries and projects |

## Security

- **CORS**: Locked to `jamescq.com` and `localhost` origins (configurable via `CORS_ORIGINS`)
- **Authentication**: Better Auth with session cookies
- **Ownership**: Journal entries and projects are scoped to the creating user
- **Input validation**: All write endpoints validated with Zod schemas
- **Credentials**: Never committed — loaded from `.env` file
