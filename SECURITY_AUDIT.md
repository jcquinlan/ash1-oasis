# Security Audit — ash1-oasis Homelab

**Date**: 2026-02-13
**Scope**: Full codebase review — Docker, API, frontend, database, CI/CD, network

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Exploitable now; could lead to full system compromise |
| **HIGH** | Significant risk; should be fixed before exposing to untrusted networks |
| **MEDIUM** | Defense-in-depth gap; fix as part of normal hardening |
| **LOW** | Best-practice recommendation |

---

## CRITICAL Findings

### 1. CORS accepts every origin with credentials

**File**: `oasis-api/src/index.ts:32-37`

```typescript
app.use('/*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))
```

**Problem**: The origin callback reflects whatever `Origin` header the browser sends, and `credentials: true` means auth cookies are attached. Any website on the internet can make authenticated requests to your API on behalf of a logged-in user. This is a textbook CSRF bypass.

**Fix**:
```typescript
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')

app.use('/*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : '',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))
```

---

### 2. Docker socket mounted into API container

**Files**: `docker-compose.yml:63`, `docker-compose.prod.yml:96`

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

**Problem**: Even read-only, this grants the container the ability to:
- Enumerate all containers, images, volumes, and networks on the host
- Read environment variables of other containers (including secrets) via `docker inspect`
- Read mounted volumes and network configuration

If the API is compromised (e.g., through the CORS issue above), the attacker has read access to your entire Docker infrastructure.

**Fix**: Replace the Docker socket with a restricted proxy like [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) that only exposes the `containers/list` endpoint:

```yaml
# Add to docker-compose.prod.yml
docker-proxy:
  image: tecnativa/docker-socket-proxy
  restart: always
  environment:
    CONTAINERS: 1   # allow listing containers
    POST: 0          # deny all write operations
    IMAGES: 0
    NETWORKS: 0
    VOLUMES: 0
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
  # Only accessible from the internal Docker network, not the host
```

Then point the API at `http://docker-proxy:2375` and use the Docker Engine API instead of shelling out.

---

### 3. Shell command execution via `sh -c`

**File**: `oasis-api/src/index.ts:70-79`

```typescript
async function exec(cmd: string): Promise<...> {
  const proc = Bun.spawn(['sh', '-c', cmd], { ... })
}
```

**Problem**: Every system monitoring call goes through `sh -c`, which interprets shell metacharacters. The current callers pass hardcoded strings, so there's no injection today — but this pattern is one code change away from a Remote Code Execution (RCE) vulnerability. If any user-controlled input ever reaches `exec()`, it's game over.

**Fix**: Read `/proc` files directly with Bun's file API instead of shelling out:

```typescript
// Instead of: exec(`cat ${procPath}/uptime`)
const uptime = await Bun.file(`${procPath}/uptime`).text()
```

For Docker container listing, use the Docker Engine REST API via the socket (or proxy) instead of `docker ps`.

---

### 4. Hardcoded fallback database credentials in source code

**Files**: `oasis-api/src/index.ts:19`, `oasis-api/src/auth.ts:5`

```typescript
const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@oasis:5432/postgres')
```

**Problem**: If `DATABASE_URL` is unset, the app silently connects with default `postgres:postgres` credentials. Combined with the weak `.env.example` password (`changeme`), this creates a pattern where production could easily run with trivially guessable credentials.

**Fix**: Fail hard if the variable is missing:

```typescript
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error('DATABASE_URL is required')
const sql = postgres(dbUrl)
```

Do the same for `BETTER_AUTH_SECRET`. The app should refuse to start without its critical secrets.

---

## HIGH Findings

### 5. No rate limiting on any endpoint

**Problem**: No rate limiting exists on login (`/api/auth/*`), the Anthropic-powered step generator (`/api/projects/generate-steps`), or any CRUD endpoint. This enables:
- **Brute-force attacks** on login
- **API cost abuse** — each `/generate-steps` call invokes Claude, which costs money
- **DoS** by flooding write endpoints

**Fix**: Add Hono's rate-limiting middleware or use a reverse proxy (nginx/Traefik) with rate limits. Prioritize:
1. `/api/auth/*` — 5 attempts per minute per IP
2. `/api/projects/generate-steps` — 10 per hour per user
3. Global — 100 requests per minute per IP

---

### 6. Sessions last 7 days with no revocation mechanism

**File**: `oasis-api/src/auth.ts:21-24`

```typescript
session: {
  expiresIn: 60 * 60 * 24 * 7, // 7 days
  updateAge: 60 * 60 * 24,      // refresh every 1 day
}
```

**Problem**: A stolen session token is valid for up to 7 days. There's no endpoint to list active sessions or revoke them. If your browser is compromised, you have no way to force logout.

**Fix**: Reduce `expiresIn` to 24 hours for a homelab. Add a "logout all sessions" endpoint via Better Auth's session management.

---

### 7. Nginx missing security headers

**File**: `oasis-web/nginx.conf`

**Problem**: The Nginx config serves the SPA with zero security headers. Missing:
- `Content-Security-Policy` — allows XSS if any injection point exists
- `X-Frame-Options` — allows clickjacking
- `X-Content-Type-Options` — allows MIME-sniffing attacks
- `Strict-Transport-Security` — allows downgrade to HTTP
- `Referrer-Policy` — leaks URLs to third parties

**Fix**: Add to the `server` block in `nginx.conf`:

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'" always;
# Add once you have HTTPS:
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

### 8. No input length validation on write endpoints

**Files**: `oasis-api/src/index.ts:198-213` (journal), `oasis-api/src/index.ts:420-447` (projects)

**Problem**: The journal and project creation endpoints check for field presence but not length. A user (or attacker) can submit a multi-megabyte title or content body, consuming database storage and memory.

**Fix**: Add max-length checks:

```typescript
if (title.length > 255 || content.length > 100_000) {
  return c.json({ error: 'Title max 255 chars, content max 100KB' }, 400)
}
```

---

### 9. `/proc` mounted into container

**File**: `docker-compose.prod.yml:97`

```yaml
- /proc:/host/proc:ro
```

**Problem**: Mounting the host's `/proc` exposes every process on the host to the container, including their environment variables (`/proc/[pid]/environ`), command lines, and memory maps. If the API container is compromised, the attacker can read secrets from any process on the host.

**Fix**: If you only need uptime, memory, load, and disk stats, consider running a dedicated metrics exporter (like `node-exporter`) as a sidecar and querying it over HTTP. This gives you the same data without exposing `/proc`.

---

### 10. Containers run as root

**Files**: `oasis-api/Dockerfile`, `oasis-web/Dockerfile`

**Problem**: Neither Dockerfile creates or switches to a non-root user. If a container escape occurs (especially with the Docker socket mounted), the attacker is root on the host.

**Fix**: Add to each Dockerfile:

```dockerfile
RUN addgroup --system app && adduser --system --ingroup app app
USER app
```

---

### 11. No network segmentation between containers

**Problem**: All services share the default Docker Compose network. The web frontend container can talk directly to PostgreSQL. If any container is compromised, lateral movement to every other container is unrestricted.

**Fix**: Define separate networks:

```yaml
networks:
  frontend:
  backend:

services:
  oasis-web:
    networks: [frontend]
  oasis-api:
    networks: [frontend, backend]
  oasis:
    networks: [backend]
```

Now the web container can only reach the API, not the database directly.

---

## MEDIUM Findings

### 12. No HTTPS / TLS termination configured

**Problem**: There's no reverse proxy with TLS in the compose stack. The production ports bind to `127.0.0.1`, which means you likely have an external reverse proxy handling TLS — but that configuration isn't in this repo, so it can't be audited here.

**Action**: Confirm your external proxy enforces HTTPS and redirects HTTP. Consider adding a Traefik or Caddy container to this compose stack so TLS is version-controlled and reproducible.

---

### 13. `latest` image tags in Dockerfiles

**Files**: `oasis-api/Dockerfile:1`, `oasis-api/Dockerfile.dev:1`

```dockerfile
FROM oven/bun:latest
```

**Problem**: `latest` is a moving target. A new Bun release could break your build or introduce a vulnerability without any change on your end.

**Fix**: Pin to a specific version: `FROM oven/bun:1.1.38` (or whatever you're currently running).

---

### 14. Backups stored on same host, unencrypted

**File**: `docker-compose.prod.yml:126-151`

**Problem**: The `oasis-backup` container writes `pg_dump` output to a Docker volume on the same machine. If the host disk fails or is compromised, backups are lost or exposed.

**Fix**:
- Encrypt dumps with `gpg` before storing
- Sync to an off-site location (S3, Backblaze B2, another machine via rsync)
- Test restores periodically

---

### 15. Automatic deploy on every push to master — no approval gate

**File**: `.github/workflows/deploy.yml:4-5`

```yaml
on:
  push:
    branches: [master]
```

**Problem**: Any commit merged to master immediately deploys to production. A force-push or compromised GitHub account deploys malicious code automatically.

**Fix**: Add an `environment: production` with required reviewers in the deploy job, or use a manual `workflow_dispatch` trigger for production.

---

### 16. Health check endpoint doesn't verify dependencies

**File**: `oasis-api/src/index.ts:145`

```typescript
app.get('/api/health', (c) => c.json({ status: 'ok' }))
```

**Problem**: Returns `200 OK` even if the database is down or unreachable. The Docker healthcheck and the CI deploy healthcheck both trust this endpoint.

**Fix**:

```typescript
app.get('/api/health', async (c) => {
  try {
    await sql`SELECT 1`
    return c.json({ status: 'ok' })
  } catch {
    return c.json({ status: 'degraded', db: 'unreachable' }, 503)
  }
})
```

---

### 17. `trustedOrigins` in auth includes hardcoded `http://localhost:3000`

**File**: `oasis-api/src/auth.ts:25-28`

```typescript
trustedOrigins: [
  process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  'http://localhost:3000',
]
```

**Problem**: In production, `localhost:3000` shouldn't be a trusted origin. This could allow a local process on the server to abuse auth endpoints.

**Fix**: Drive trusted origins entirely from environment variables. Only include `localhost` values in development.

---

## LOW Findings

### 18. No dependency vulnerability scanning in CI

The GitHub Actions workflow builds and deploys but never runs `bun audit`, `trivy`, or any CVE scanner.

**Fix**: Add a `trivy image scan` step after build, and `bun audit` before build.

---

### 19. `.env.example` has weak placeholder passwords

**File**: `.env.example`

```
POSTGRES_PASSWORD=changeme
BETTER_AUTH_SECRET=change-me-generate-a-real-secret
```

These are fine as examples, but consider adding a setup script that generates real values and refuses to start with the defaults.

---

### 20. No audit logging

No record of who created, modified, or deleted journal entries or projects. Soft deletes exist but lack `deleted_by` attribution.

**Fix**: Add `created_by` and `updated_by` columns that reference the authenticated user ID. Log auth events (login, logout, failed attempts) to a dedicated table or structured stdout.

---

## Port Exposure Summary

| Service | Dev Port | Prod Port | Bound To | Risk |
|---------|----------|-----------|----------|------|
| PostgreSQL | 5432 | none | `127.0.0.1` | LOW — localhost only in dev, not exposed in prod |
| oasis-web | 3000 | 8081 | `127.0.0.1` | LOW — assumes external reverse proxy handles public access |
| oasis-api | 3001 | 8082 | `127.0.0.1` | LOW — same assumption |
| Docker socket | n/a | n/a | mounted volume | **CRITICAL** — see finding #2 |
| `/proc` | n/a | n/a | mounted volume | **HIGH** — see finding #9 |

All TCP ports bind to `127.0.0.1`, which is good — they aren't directly reachable from the network. The risk is in the volume mounts (Docker socket and `/proc`) which give the API container far more host access than it needs.

---

## Prioritized Action Plan

**Immediate** (do before exposing to any untrusted traffic):
1. Fix CORS to allowlist specific origins (finding #1)
2. Fail on missing `DATABASE_URL` and `BETTER_AUTH_SECRET` (finding #4)
3. Replace Docker socket mount with docker-socket-proxy (finding #2)

**Short-term** (next hardening pass):
4. Add rate limiting to auth and LLM endpoints (finding #5)
5. Add security headers to Nginx (finding #7)
6. Add input length validation (finding #8)
7. Stop mounting `/proc` — use a metrics exporter (finding #9)
8. Create non-root users in Dockerfiles (finding #10)
9. Add network segmentation (finding #11)

**Medium-term** (ongoing improvements):
10. Pin base image versions (finding #13)
11. Encrypt and off-site backups (finding #14)
12. Add deploy approval gate (finding #15)
13. Make health check verify DB (finding #16)
14. Add dependency scanning to CI (finding #18)
15. Add audit logging (finding #20)
