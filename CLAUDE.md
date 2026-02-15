# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository serves as a **homelab DevOps monorepo** - a learning journey to develop infrastructure and DevOps skills. The current "ash1 oasis" monitoring dashboard is the foundation, but this repo is designed to grow into a comprehensive collection of self-hosted services.

**Mentoring Approach**: When working together, provide guidance as an experienced DevOps professional. Focus on:
- Infrastructure as Code best practices
- Container orchestration patterns
- Monitoring and observability strategies
- Security hardening techniques
- CI/CD pipeline design
- Service mesh and networking concepts
- Backup and disaster recovery planning

## Project Structure

```
ash1-oasis/
├── oasis-web/           # React frontend
├── oasis-api/           # Hono API server
├── scripts/db/init/     # PostgreSQL initialization scripts
├── docker-compose.yml   # Development compose (with HMR)
└── docker-compose.prod.yml  # Production compose
```

Services:
- `oasis` - PostgreSQL 16 database container
- `oasis-web` - React frontend (dev: 3000, prod: 8081)
- `oasis-api` - Hono API server (dev: 3001, prod: 8082)

## Development Commands

### Docker (recommended)
```bash
# Start all services with HMR
docker compose up

# Production build
docker compose -f docker-compose.prod.yml up -d
```

### Frontend (oasis-web/)
```bash
bun install      # Install dependencies
bun run dev      # Development server
bun run build    # Build for production
bun run preview  # Preview production build
```

### API (oasis-api/)
```bash
bun install      # Install dependencies
bun run dev      # Development with hot reload
bun run deploy   # Production server
```

## Technology Stack

- **Runtime**: Bun for all services
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Hono framework
- **Database**: PostgreSQL 16
- **Containerization**: Docker with docker-compose
- **CI/CD**: Drone CI
- **System Monitoring**: Direct system calls to /proc filesystem and Docker CLI

## Architecture Overview

The frontend makes API calls to `/api/containers` and `/api/system` endpoints to fetch:
- Docker container status via `docker ps` commands
- System metrics from `/proc` filesystem (uptime, memory, load, disk usage)

The API server executes shell commands using Bun.spawn to gather system information and returns JSON responses. The frontend polls these endpoints every 5 seconds for real-time updates.

Vite configuration restricts preview server to allow only `jamescq.com` as allowed host, suggesting this is deployed on that domain.

## Database Migrations

Migration files live in `scripts/db/init/` and are run by the `oasis-migrations` container on every `docker compose up`. All SQL in migration files **must be idempotent** so they can safely re-run against an existing database. Use patterns like:
- `CREATE SCHEMA IF NOT EXISTS`
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER` (Postgres has no `IF NOT EXISTS` for triggers)

## Fail Loudly

New services and CI/CD pipelines **must fail noisily** — silent failures are the worst kind of failures. Apply these principles:

### Services
- Containers should use **health checks** that cause restarts on failure, not just keep running in a degraded state
- Use `restart: unless-stopped` or `restart: on-failure` with clear exit codes — never swallow errors to stay "up"
- Startup dependencies should be explicit (`depends_on` with `condition: service_healthy`) so a broken dependency blocks startup rather than producing runtime errors
- Log to stdout/stderr so failures surface in `docker compose logs` — never log to a file inside the container where it won't be seen

### CI/CD Pipelines
- Pipeline steps must use `set -euo pipefail` (or equivalent) so any command failure stops the build immediately
- Never use `|| true`, `set +e`, or ignore exit codes unless there is a documented reason
- Builds and deploys should fail the pipeline on warnings, not just errors, where practical
- Notifications (webhook, email, etc.) should fire on failure — a red pipeline nobody sees is the same as no pipeline

### General
- Prefer crashing over silently returning defaults or empty results
- Health check endpoints should verify actual dependencies (database connectivity, upstream reachability), not just return 200
- When adding error handling, handle the error *or* propagate it — never catch and ignore

## DevOps Learning Goals

This monorepo supports hands-on learning of:
- **Container orchestration** with Docker and future Kubernetes migration
- **Service discovery** and inter-service communication patterns
- **Infrastructure monitoring** with metrics, logs, and alerting
- **GitOps workflows** for declarative deployments
- **Security practices** including secrets management and network policies
- **High availability** design patterns and load balancing
- **Backup strategies** and disaster recovery procedures

As new services are added, each should follow established patterns for configuration management, health checks, logging, and deployment automation.

## Agent Harness

This project includes an agent harness for autonomous PRD-driven work.

- **Activate**: `/harness "description of work to do"`
- **Normal mode**: When `/harness` is not invoked, Claude works normally with no harness constraints
- **Requires**: `jq` must be installed on the system

The harness decomposes work into small PRDs with testable acceptance criteria and keeps Claude working until all PRDs are complete. See `.claude/skills/harness/SKILL.md` for details.