# ash1-oasis

A homelab DevOps monorepo featuring a monitoring dashboard that displays system stats and Docker container status.

## Project Structure

```
ash1-oasis/
├── oasis-web/           # React frontend
├── oasis-api/           # Hono API server
├── scripts/db/init/     # PostgreSQL initialization scripts
├── docker-compose.yml   # Development compose
└── docker-compose.prod.yml  # Production compose
```

## Services

| Service | Description | Dev Port | Prod Port |
|---------|-------------|----------|-----------|
| `oasis` | PostgreSQL 16 database | 5432 | internal |
| `oasis-web` | React + Vite frontend | 3000 | 8081 |
| `oasis-api` | Hono API server | 3001 | 8082 |

## Tech Stack

- **Runtime**: Bun
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Hono framework
- **Database**: PostgreSQL 16
- **Containerization**: Docker with docker-compose
- **CI/CD**: Drone CI

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
   - PostgreSQL: localhost:5432

## Development

### Hot Module Reloading

The development setup includes HMR for rapid iteration:

- **Frontend**: Edit files in `oasis-web/src/` and changes reflect immediately in the browser
- **API**: Edit files in `oasis-api/src/` and the server reloads automatically

### Local Development Commands

#### Frontend (oasis-web/)
```bash
bun install      # Install dependencies
bun run dev      # Development server
bun run build    # Build for production
bun run preview  # Preview production build
```

#### API (oasis-api/)
```bash
bun install      # Install dependencies
bun run dev      # Development with hot reload
bun run deploy   # Production server
```

## Production Deployment

### Manual Deployment

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### CI/CD with Drone

The repository includes a `.drone.yml` configuration that:

1. Builds and validates `oasis-web` and `oasis-api`
2. Deploys via SSH on merge to `main`/`master`

Required Drone secrets:
- `deploy_host` - Server hostname
- `deploy_user` - SSH username
- `deploy_key` - SSH private key

### Server Setup

1. Clone repo to `/opt/ash1-oasis`
2. Create `.env` with production credentials
3. Ensure Docker and docker-compose are installed
4. Configure Drone secrets for automated deployment

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/containers` - Docker container status
- `GET /api/system` - System metrics (uptime, memory, load, disk)

## Architecture

The frontend polls the API every 5 seconds for real-time updates. The API server:

- Executes `docker ps` commands to gather container status
- Reads from `/proc` filesystem for system metrics (uptime, memory, load)
- Uses `df` for disk usage information
