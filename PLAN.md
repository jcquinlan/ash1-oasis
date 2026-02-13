# Better Auth Implementation Plan

## Overview

Add email/password authentication using [Better Auth](https://www.better-auth.com/) to the oasis homelab. The site stays browsable by anonymous visitors — they just can't access protected resources (dashboard, projects, journal editing). Journal entries get an `is_public` flag so you can publish blog-style posts that anyone can read.

No public registration. A seed script creates your admin account.

---

## Phase 1: Database — Auth Tables + Journal `is_public` Column

**File: `scripts/db/init/05-auth.sql`** (new)

Create the four tables Better Auth requires (`user`, `session`, `account`, `verification`) in a dedicated `auth` schema. Better Auth uses camelCase column names by default, so we quote them in Postgres to preserve case.

Also add `is_public BOOLEAN DEFAULT false` to `journal.entries` so existing entries stay private and you can flip individual ones to public.

> Why a SQL migration instead of Better Auth's programmatic `runMigrations()`? It keeps all schema changes in one place (`scripts/db/init/`), visible in version control, and follows the existing idempotent migration pattern.

---

## Phase 2: API — Better Auth Server + Middleware

### 2a. Install dependencies in `oasis-api/`

- `better-auth`
- `kysely` + `kysely-postgres-js` (bridge between Better Auth's Kysely internals and your existing `postgres` package)

### 2b. New file: `oasis-api/src/auth.ts`

Configure Better Auth with:
- `PostgresJSDialect` from `kysely-postgres-js`, pointing at the `auth` schema via `search_path`
- `emailAndPassword: { enabled: true }`
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from env vars

### 2c. Update `oasis-api/src/index.ts`

1. **Mount the Better Auth handler** on `GET|POST /api/auth/*` — this gives you signup, signin, signout, session endpoints for free.
2. **Add session-populating middleware** that runs on every request. It calls `auth.api.getSession({ headers })` and stashes the result in Hono's typed context (`c.set("user", ...)`). If no valid session, `user` is `null` — the request still proceeds (browse-freely model).
3. **Create a `requireAuth` guard** middleware using `createMiddleware` from `hono/factory`. Routes wrapped with this return 401 if `user` is null.
4. **Apply `requireAuth`** to:
   - `GET /api/containers`
   - `GET /api/system`
   - All `/api/projects/*` routes
   - `POST /api/journal` (create)
   - `PUT /api/journal/:id` (update)
   - `DELETE /api/journal/:id` (delete)
5. **Update journal GET routes** to be visibility-aware:
   - `GET /api/journal` — if authenticated, return all entries; if anonymous, return only `WHERE is_public = true`
   - `GET /api/journal/:id` — if the entry is not public and the user is not authenticated, return 404
6. **Add `is_public`** to journal INSERT/UPDATE queries so the field can be set from the editor.
7. **Replace the wide-open `cors()` call** with a scoped CORS config that allows credentials (cookies).

---

## Phase 3: Frontend — Auth Client + Login Page

### 3a. Install dependency in `oasis-web/`

- `better-auth` (the React client lives at `better-auth/react`)

### 3b. New file: `oasis-web/src/lib/auth-client.ts`

```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({
  baseURL: window.location.origin, // works in dev (Vite proxy) and prod
});
export const { useSession } = authClient;
```

### 3c. New page: `oasis-web/src/pages/LoginPage.tsx`

Simple email + password form. On success, redirect to `/`. No registration form — admin is seeded.

### 3d. Update `Layout.tsx`

- Call `useSession()` in the Layout.
- If logged in: show user email + "Sign out" button in the header.
- If not logged in: show a "Sign in" link.
- Conditionally hide nav links to protected sections (Dashboard, Projects) when not logged in — the API will 401 anyway, but hiding them is cleaner UX.

### 3e. New component: `RequireAuth`

A wrapper that checks `useSession()`. If not authenticated, redirects to `/login`. Used to guard route groups.

### 3f. Update `main.tsx` routing

```
Layout (shared header/nav/footer)
├── /              → JournalPage (public homepage — shows public entries)
├── /login         → LoginPage
├── /dashboard     → RequireAuth → DashboardPage
├── /projects      → RequireAuth → ProjectsPage
├── /projects/new  → RequireAuth → ProjectNewPage
├── /projects/:id  → RequireAuth → ProjectDetailPage
├── /projects/:id/edit → RequireAuth → ProjectEditPage
├── /journal       → JournalPage (all entries when logged in, public when not)
├── /journal/new   → RequireAuth → JournalEditPage
├── /journal/:id   → JournalEditPage (read public entries anon, edit requires auth)
```

The homepage changes from Dashboard → Journal (blog). Dashboard moves to `/dashboard` behind auth. This makes the public-facing site a blog by default.

### 3g. Update `JournalEditor`

Add an `is_public` toggle (checkbox/switch) to the editor UI. Defaults to `false`. Persisted via the existing save flow.

### 3h. Update `JournalPage` / `JournalList`

Show a small "public" badge on entries that are marked public. When not logged in, only public entries are returned by the API, so no frontend filtering needed.

### 3i. Update `useJournal.ts`

Pass `is_public` in create/update payloads. Include it in the response type.

---

## Phase 4: Admin Seed Script

**New file: `scripts/seed-admin.ts`**

A Bun script that calls Better Auth's server-side API to create the admin user:

```ts
import { auth } from "../oasis-api/src/auth";
await auth.api.signUpEmail({
  body: { name: "Admin", email: "you@example.com", password: "..." },
});
```

Run with: `bun run scripts/seed-admin.ts`

Environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`) must be set. Document this in a comment at the top of the file and in `.env.example`.

---

## Phase 5: Docker / Infra Updates

### 5a. `.env.example`

Add:
```
BETTER_AUTH_SECRET=generate-me-with-openssl-rand-base64-32
BETTER_AUTH_URL=http://localhost:3001
```

### 5b. `docker-compose.yml`

Pass `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` to the `oasis-api` container environment.

### 5c. Production `nginx.conf`

Add a `location /api/` block that proxies to the API server with `proxy_pass_header Set-Cookie` so auth cookies flow through. (In dev, Vite's proxy already handles this.)

---

## What's NOT in scope (kept simple)

- No email verification (homelab, single user — skip for now)
- No OAuth/social login (can add later with one config change)
- No role-based access control (single admin user)
- No "forgot password" flow (you own the DB, can reset directly)
- No registration page (seed script only)
- No per-project or per-resource ACLs (just auth vs. anon + journal `is_public`)

---

## Files Changed / Created Summary

| File | Action |
|------|--------|
| `scripts/db/init/05-auth.sql` | **Create** — auth schema + `is_public` column |
| `oasis-api/package.json` | **Edit** — add `better-auth`, `kysely`, `kysely-postgres-js` |
| `oasis-api/src/auth.ts` | **Create** — Better Auth server config |
| `oasis-api/src/index.ts` | **Edit** — mount auth handler, add middleware, protect routes, update journal queries |
| `oasis-web/package.json` | **Edit** — add `better-auth` |
| `oasis-web/src/lib/auth-client.ts` | **Create** — Better Auth React client |
| `oasis-web/src/pages/LoginPage.tsx` | **Create** — login form |
| `oasis-web/src/pages/LoginPage.module.css` | **Create** — login page styles |
| `oasis-web/src/components/RequireAuth.tsx` | **Create** — auth guard wrapper |
| `oasis-web/src/main.tsx` | **Edit** — new routes, RequireAuth wrappers |
| `oasis-web/src/Layout.tsx` | **Edit** — session-aware header (sign in/out) |
| `oasis-web/src/hooks/useJournal.ts` | **Edit** — add `is_public` field |
| `oasis-web/src/ui/components/JournalEditor/*` | **Edit** — add public toggle |
| `oasis-web/src/ui/components/JournalList/*` | **Edit** — show public badge |
| `oasis-web/src/pages/JournalPage.tsx` | **Edit** — conditional UI for anon vs auth |
| `scripts/seed-admin.ts` | **Create** — admin user seed script |
| `.env.example` | **Edit** — add auth env vars |
| `docker-compose.yml` | **Edit** — pass auth env vars to API container |
| `oasis-web/nginx.conf` | **Edit** — add API proxy for production |
