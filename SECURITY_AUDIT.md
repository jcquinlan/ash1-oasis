# Security Audit: ash1-oasis Homelab

**Date**: 2026-02-07
**Scope**: Full architecture review of the oasis monitoring dashboard and journal API

---

## Executive Summary

The project has solid foundations: localhost-only port bindings, parameterized SQL queries, minimal dependencies, multi-stage Docker builds for the frontend, and health checks on all services. However, several high-severity issues need attention before this is safely exposed on a network, even a home network.

The three most urgent items are: **no authentication on any endpoint**, **Docker socket mounted into the API container**, and **unrestricted CORS allowing any origin to call the API**.

---

## Findings

### 1. No Authentication or Authorization (CRITICAL)

**Location**: `oasis-api/src/index.ts` - all routes

Every endpoint is publicly accessible with zero authentication:
- `GET /api/containers` exposes all Docker container metadata
- `GET /api/system` exposes host memory, disk, load, and uptime
- Full CRUD on `/api/journal` lets anyone create, read, update, or delete entries

**Why it matters**: Even on a home network, any device (or any malware on any device) can read your infrastructure details and wipe your journal data. If the reverse proxy ever exposes this to the internet, it's completely open.

**Remediation options** (pick one, in order of complexity):
- **Quick**: API key in a header, checked via Hono middleware. Store the key in `.env`.
- **Better**: JWT-based auth with a simple login endpoint. Hono has a built-in `jwt()` middleware.
- **Best for learning**: OAuth2/OIDC via a self-hosted identity provider like Authelia or Keycloak sitting in front of your reverse proxy.

Example minimal API key middleware:
```typescript
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()
  const key = c.req.header('X-API-Key')
  if (key !== process.env.API_KEY) return c.json({ error: 'Unauthorized' }, 401)
  return next()
})
```

---

### 2. Docker Socket Exposure (CRITICAL)

**Location**: `docker-compose.yml:62`, `docker-compose.prod.yml:95`

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

The Docker socket is effectively root access to the host. Even mounted read-only, it allows listing all containers, reading environment variables (including secrets), inspecting volumes, and reading logs. Combined with the `docker.io` CLI installed in the API container (`oasis-api/Dockerfile:3`), a compromised API container can enumerate your entire infrastructure.

**Why it matters**: If an attacker gains code execution inside the API container (e.g., through a future dependency vulnerability), they can pivot to full host control. The `:ro` flag does NOT prevent `docker exec`, `docker inspect`, or reading secrets from other containers.

**Remediation options**:
- **Socket proxy**: Use a Docker socket proxy like [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) that whitelists only `GET /containers` and blocks everything else.
- **Drop the socket entirely**: Replace the `docker ps` shell command with calls to the Docker Engine API over a restricted socket proxy.
- **Dedicated monitoring**: Use a purpose-built agent like cAdvisor or Prometheus node-exporter that exposes only metrics, not control plane access.

---

### 3. Unrestricted CORS (HIGH)

**Location**: `oasis-api/src/index.ts:9`

```typescript
app.use('/*', cors())
```

This allows **any website on the internet** to make API calls to your server from a visitor's browser. If your API is reachable (even through a reverse proxy), any malicious or compromised website could silently query your system metrics or modify journal entries.

**Remediation**: Restrict to your actual domain:
```typescript
app.use('/*', cors({
  origin: ['https://jamescq.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
}))
```

---

### 4. Shell Command Execution Pattern (HIGH)

**Location**: `oasis-api/src/index.ts:11-20`

```typescript
async function exec(cmd: string): Promise<...> {
  const proc = Bun.spawn(['sh', '-c', cmd], { ... })
}
```

Every system metric is gathered by passing strings to `sh -c`. The `PROC_PATH` environment variable is interpolated directly into shell commands at line 44-45:

```typescript
exec(`cat ${procPath}/uptime`)
```

If `PROC_PATH` were ever set to a malicious value (e.g., via environment injection), this becomes arbitrary command execution.

**Why it matters**: The pattern itself is fragile. Today the inputs are controlled, but as the codebase grows, it's easy to accidentally pass user-controlled data into this function.

**Remediation**:
- Read `/proc` files using `Bun.file()` instead of shelling out to `cat`:
  ```typescript
  const uptime = await Bun.file(`${procPath}/uptime`).text()
  ```
- For `docker ps`, use the Docker Engine REST API over the socket (`/var/run/docker.sock`) via HTTP, or use a library like `dockerode`.
- If you must shell out, use `Bun.spawn(['cat', path])` with explicit argument arrays instead of `sh -c`.

---

### 5. Hardcoded Fallback Database Credentials (MEDIUM)

**Location**: `oasis-api/src/index.ts:7`

```typescript
const sql = postgres(
  process.env.DATABASE_URL || 'postgres://postgres:postgres@oasis:5432/postgres'
)
```

If `DATABASE_URL` is ever unset (misconfigured `.env`, missing during a deploy), the API silently falls back to well-known default credentials.

**Remediation**: Fail fast instead of falling back:
```typescript
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}
const sql = postgres(process.env.DATABASE_URL)
```

---

### 6. /proc Filesystem Mount (MEDIUM)

**Location**: `docker-compose.yml:63`, `docker-compose.prod.yml:96`

```yaml
volumes:
  - /proc:/host/proc:ro
```

Mounting the entire `/proc` exposes: process lists, environment variables of all host processes (`/proc/*/environ`), kernel configuration, memory maps, and more. The API only needs `uptime`, `meminfo`, and `loadavg`.

**Remediation**: Mount only the specific files you need:
```yaml
volumes:
  - /proc/uptime:/host/proc/uptime:ro
  - /proc/meminfo:/host/proc/meminfo:ro
  - /proc/loadavg:/host/proc/loadavg:ro
```

---

### 7. Containers Run as Root (MEDIUM)

**Location**: `oasis-api/Dockerfile`, `oasis-api/Dockerfile.dev`

Neither Dockerfile sets a non-root user. The API process runs as root inside the container, which means if there's a container escape vulnerability, the attacker is root on the host.

**Remediation**: Add a non-root user to the Dockerfile:
```dockerfile
RUN groupadd -r oasis && useradd -r -g oasis oasis
# ... install dependencies ...
USER oasis
```

Note: The Docker socket requires the `oasis` user to be in the `docker` group, or you'll need to adjust socket permissions. This is another reason to prefer a socket proxy.

---

### 8. Missing Security Headers in Nginx (MEDIUM)

**Location**: `oasis-web/nginx.conf`

The nginx config serves static files but adds no security headers. This leaves the frontend vulnerable to clickjacking, MIME-sniffing attacks, and lacks a Content Security Policy.

**Remediation**: Add a security headers block:
```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# Content Security Policy - adjust as needed for your scripts/styles
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" always;
```

---

### 9. No Input Validation on Journal Endpoints (MEDIUM)

**Location**: `oasis-api/src/index.ts:118-172`

The journal endpoints check for presence of `title` and `content` but don't validate length or type. An attacker (or a bug) could POST megabytes of text, filling the database.

**Remediation**: Add basic size limits:
```typescript
if (typeof title !== 'string' || title.length > 255) {
  return c.json({ error: 'Title must be a string under 255 characters' }, 400)
}
if (typeof content !== 'string' || content.length > 50000) {
  return c.json({ error: 'Content must be a string under 50,000 characters' }, 400)
}
```

Also consider adding rate limiting via Hono's `rateLimiter` middleware.

---

### 10. Unpinned Base Image Tags (LOW)

**Location**: `oasis-api/Dockerfile:1`

```dockerfile
FROM oven/bun:latest
```

Using `latest` means your builds are not reproducible. A new Bun release could break your build, or worse, a compromised `latest` tag could inject malicious code.

**Remediation**: Pin to a specific version:
```dockerfile
FROM oven/bun:1.1.45
```

The frontend Dockerfile already partially does this with `oven/bun:1`, but a full version pin is better.

---

### 11. CI/CD Pipeline Gaps (LOW)

**Location**: `.github/workflows/deploy.yml`

The pipeline builds and deploys but lacks:
- **Image vulnerability scanning**: No Trivy, Grype, or Snyk step to catch known CVEs in base images or dependencies.
- **No rollback mechanism**: If the deploy health check fails, the broken version stays running.
- **Zero-downtime deploys**: `--force-recreate` kills containers before starting new ones, causing a brief outage.

**Remediation suggestions**:
- Add Trivy scan step after build: `aquasecurity/trivy-action@master`
- Add a rollback step that re-deploys the previous `IMAGE_TAG` if health checks fail
- Consider using `docker compose up -d --remove-orphans` with health-check-based readiness instead of `--force-recreate`

---

## What You're Doing Well

These are worth calling out because they represent good security instincts:

- **Localhost-only port bindings** (`127.0.0.1:XXXX`) in both dev and prod compose files. This is the single most important network security decision - services are not directly exposed to the network.
- **Parameterized SQL queries** throughout journal endpoints. The `postgres` library's tagged template literals prevent SQL injection by design.
- **Read-only volume mounts** (`:ro`) for source code, Docker socket, and proc filesystem.
- **Health checks** on all services in production compose.
- **Multi-stage Docker build** for the frontend keeps the final image minimal (nginx:alpine + static files only).
- **Minimal dependencies** - 2 runtime deps in the API, 3 in the frontend. Smaller dependency tree = smaller attack surface.
- **`.gitignore` excludes `.env` files** - no credentials committed to the repo.
- **Database not exposed in production** - PostgreSQL has no port mapping in `docker-compose.prod.yml`.

---

## Prioritized Action Plan

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | Add authentication middleware | Medium |
| 2 | Replace Docker socket with socket proxy | Medium |
| 3 | Restrict CORS to your domain | Trivial |
| 4 | Replace shell exec with Bun.file() for /proc reads | Low |
| 5 | Remove database credential fallback | Trivial |
| 6 | Mount only needed /proc files | Trivial |
| 7 | Add non-root user to Dockerfiles | Low |
| 8 | Add security headers to nginx | Low |
| 9 | Add input length validation | Low |
| 10 | Pin Docker base image versions | Trivial |
| 11 | Add image scanning to CI/CD | Low |
