# Project Name
Blog Enhancements

The goal of this project to migrate the basic Journal functionality to instead be a properly structured blog.
The writing experience as we have it is good (the simple markdown editor, plus autosaving). Instead, I want to make the root of the web app be a more traditional blog landing page, which then leads into a feed of my public posts. Basically, I want the core web app experience to be a blog, and then I can build out more of private homelab stuff elsewhere, or behind an admin route or something. The process of making the existing web app feel more like a traditional blog (without removing any existing functionality, mind you) may call for adding new features, or tracking new data, and I expect you to know when these things might be called for vs. might be unecessary.

All changes should have test coverage, and we are striving for simplicity and cleanliness over all other things.


## Tech Stack
Use the existing services in the repo:
- **Frontend**: React 18 + TypeScript + Vite (oasis-web)
- **Backend**: Hono API server with raw SQL via `postgres` library (oasis-api)
- **Database**: PostgreSQL 16 (journal schema already exists)
- **Editor**: Tiptap (existing WYSIWYG markdown editor — unchanged)
- **Auth**: Better Auth (existing email/password auth — unchanged)
- **Runtime**: Bun for all services

New dependencies (minimal):
- **react-markdown** + **remark-gfm** — lightweight markdown rendering for the public read-only blog view. Avoids loading the full Tiptap editor bundle for anonymous readers.


## Requirements

### Blog Landing Page
- The root route (`/`) becomes a public blog landing page showing a reverse-chronological feed of published posts
- Each post card in the feed shows: title, excerpt (first ~160 characters of content if no explicit excerpt), published date, and estimated reading time
- Clicking a post card navigates to the full post view
- The feed is paginated (load more or numbered pages — keep it simple)
- Anonymous visitors can browse the feed and read public posts with no login required

### Individual Post View
- Each public post is viewable at `/blog/:slug` using a clean, read-only rendered view
- Renders the post's markdown content using react-markdown (not the Tiptap editor)
- Shows: title, published date, reading time, rendered content
- Navigation back to the blog feed

### URL Slugs
- Each journal entry gets a `slug` field — auto-generated from the title on creation, editable by the author
- Slugs must be unique among public posts
- Public posts are accessed by slug; the numeric ID is still used for API calls and the authoring interface

### Draft / Published Workflow
- Add a `published_at` timestamp column to `journal.entries`
- A post is considered "published" when `is_public = true` AND `published_at IS NOT NULL`
- Publishing sets `published_at` to the current time (if not already set)
- Unpublishing (setting `is_public = false`) preserves `published_at` so re-publishing restores the original date
- The blog feed orders by `published_at DESC`

### Excerpts
- Add an `excerpt` field to `journal.entries` (optional, TEXT)
- If the author provides an explicit excerpt, use it in the feed and meta tags
- If no excerpt, auto-generate from the first ~160 characters of the content (strip markdown formatting)

### Authoring Experience
- Existing journal editing at `/journal/new` and `/journal/:id` continues to work exactly as-is
- Add slug editing to the journal editor (shown as a text field, auto-populated from title, editable)
- Add excerpt editing to the journal editor (optional textarea)
- The publish toggle (`is_public`) remains but now also controls `published_at` behavior as described above

### Navigation Restructure
- **Public (anonymous)**: Blog feed (`/`), individual post (`/blog/:slug`), login (`/login`)
- **Authenticated**: All public routes plus Journal editor (`/journal/*`), Dashboard (`/dashboard`), Projects (`/projects/*`)
- Header nav updates: "Blog" link (always visible) points to `/`, authenticated users also see "Journal", "Dashboard", "Projects"
- The "Journal" link for authenticated users goes to `/journal` which shows their full entry list (public + private drafts)

### API Changes
- `GET /api/journal/public` — new endpoint for the public blog feed (paginated, returns only published posts with slug, title, excerpt, published_at, reading_time)
- `GET /api/journal/slug/:slug` — new endpoint to fetch a single published post by slug
- Existing `/api/journal` endpoints unchanged (still used by the authoring interface)


## Non-Requirements
- **Comments** — not building a comment system. If needed later, use a third-party solution (Giscus, etc.)
- **Tags / Categories** — not in initial scope. Can be added later without breaking changes.
- **RSS feed** — defer to a follow-up project. Nice to have, not blocking.
- **SSR / Pre-rendering** — stay as a client-side SPA. SEO for blog posts is a known tradeoff accepted for simplicity.
- **Social sharing buttons** — not needed
- **Full-text search** — not in scope
- **Scheduled publishing** — `published_at` supports it structurally, but no UI for scheduling. Publish is immediate.
- **Cover images** — not in initial scope. The `cover_image_url` column can be added later if desired.
- **Renaming the "journal" schema or tables** — keep the database schema as `journal.entries`. Only the public-facing UI uses the word "blog."


## Architecture

### Route Structure
```
Public:
  /                    → BlogFeedPage (new — public post feed)
  /blog/:slug          → BlogPostPage (new — single post read-only view)
  /login               → LoginPage (existing)

Authenticated:
  /journal             → JournalPage (existing — author's entry list)
  /journal/new         → JournalEditPage (existing, enhanced with slug/excerpt fields)
  /journal/:id         → JournalEditPage (existing, enhanced with slug/excerpt fields)
  /dashboard           → DashboardPage (existing)
  /projects/*          → Projects pages (existing)
```

### Data Flow
- **Blog feed**: `BlogFeedPage` → `GET /api/journal/public?page=1&limit=10` → renders post cards
- **Single post**: `BlogPostPage` → `GET /api/journal/slug/:slug` → renders markdown via react-markdown
- **Authoring**: Existing flow unchanged — `JournalEditPage` → `POST/PUT /api/journal` with new `slug` and `excerpt` fields

### Component Structure
```
New components:
  BlogFeedPage          — page component for /
  BlogPostPage          — page component for /blog/:slug
  PostCard              — individual post card in the feed (title, excerpt, date, reading time)

Modified components:
  JournalEditPage       — add slug + excerpt fields
  Layout                — update navigation links
  main.tsx              — update route definitions
```

### Database Changes
All changes via a new idempotent migration file (`scripts/db/init/07-blog.sql`):
```sql
ALTER TABLE journal.entries ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE journal.entries ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE journal.entries ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Partial unique index: slugs must be unique among entries that have one
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_slug
  ON journal.entries(slug) WHERE slug IS NOT NULL;

-- Optimized index for public feed queries
CREATE INDEX IF NOT EXISTS idx_journal_entries_published
  ON journal.entries(published_at DESC)
  WHERE is_public = true AND published_at IS NOT NULL;
```

Backfill for existing public entries:
```sql
UPDATE journal.entries
  SET published_at = created_at
  WHERE is_public = true AND published_at IS NULL;
```


## Constraints
- **No breaking changes** to existing functionality — all current journal CRUD, auto-save, and project features must continue working
- **No breaking changes** to existing API contracts — existing endpoints keep their current request/response shapes. New fields are additive only.
- **Idempotent migrations** — new SQL must follow existing `IF NOT EXISTS` / `IF NOT EXISTS` patterns per CLAUDE.md
- **Backward-compatible data** — legacy entries without slugs or published_at must still work in the authoring interface
- **Minimal new dependencies** — only add what's necessary for markdown rendering in the read-only view
- **Test coverage** — all new endpoints and components need tests


## Decisions

1. **Blog landing page** — simple feed of post cards only. No hero section or about blurb. Can add later if desired.
2. **Pagination** — "Load More" button.
3. **URL structure** — `/blog/:slug` for individual posts.
4. **Old routes** — no redirects needed. `/` becomes blog feed, `/journal` stays as the author list. No concern about breaking links.
5. **Reading time** — calculated on the fly from word count (client-side). Not stored.


## Reference

Target aesthetic: a clean, minimal blog like a simple Medium or Bear Blog. Content-first, generous whitespace, readable typography. No sidebar, no widgets — just posts.
