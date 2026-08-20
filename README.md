## Stack

- NestJS + TypeScript
- PostgreSQL, via `node-pg-migrate` (plain SQL, no ORM auto-sync)
- raw `pg` for queries
- Jest + Supertest

## Run it

Requires Node 20+, Docker (or a local Postgres 15+).

```bash
git clone && cd media-monitor-api
npm install
docker compose up -d
cp .env.example .env
npm run migrate:up
npm run start:dev
# → http://localhost:3000, API docs at /docs
```

Seed sample data: `npm run seed`

Tests: `npm test` (unit) and `DATABASE_URL=... npm run test:e2e` (integration,
needs migrations already applied).

## Endpoints

- `POST /internal/mentions/bulk` — accepts a raw JSON array (shape of
  `seed/seed_mentions.json`). Invalid records are skipped, not fatal.
  Returns `{ received, inserted, updated, flagged_duplicate, skipped_invalid, errors }`.
- `GET /mentions?q=&source=&from=&to=&page=&limit=&include_duplicates=` —
  sorted `published_at DESC NULLS LAST, id ASC` (stable, `id` breaks ties).
- `GET /mentions/stats?group_by=source|day` — counts, duplicates excluded.
- `GET /health` — liveness check.

## Schema

`mentions(id, external_id, source_raw, source_normalized, title, content_raw,
content_clean, url, author, published_at, engagement, content_hash,
duplicate_of_id, created_at, updated_at)`, unique on
`(source_normalized, external_id)`.

- `source_raw`/`source_normalized`: original kept for audit; everything else
  (filter, group-by, dedup key) uses the canonical name.
- `content_hash`: sha256 of normalized title+content, used to flag
  near-duplicates arriving under a different `external_id`/URL.
- `duplicate_of_id`: set when a near-duplicate is found. Row is kept, not
  discarded — just excluded from search/stats by default.

## Duplicate detection

Two mechanisms for two different problems in the seed data:

1. **Retries / exact re-post** (`str-99120` posted twice) →
   `UNIQUE(source_normalized, external_id)` + `ON CONFLICT DO UPDATE`. This
   is what makes the bulk endpoint idempotent.
2. **Cross-source near-duplicate** (`mkn-1201` vs `mkn-1202`: different ID
   and URL, same story, title differs by a hyphen) → not catchable by a
   unique key. Flagged via `content_hash` instead — the row is inserted but
   marked `duplicate_of_id`, so it's still auditable but not double-counted.

Chose flag-over-reject because the brief says the pipeline retries on
failure and ingestion is inherently messy — better to keep the data and let
an analyst see it was picked up twice than silently drop it.

## Assumptions

- Timestamps with no timezone are assumed UTC.
- Unparseable `published_at` → `NULL` (bucketed as `"unknown"` in daily stats).
- Unparseable `engagement` → `0`.
- Unknown sources are title-cased and kept, not dropped.
- `/internal/mentions/bulk` has no auth — assumed internal-only route.

## Trade-offs

- `ILIKE` for `q`, not full-text search — simpler, fine at this scale.
- Content-hash dedup is exact-after-normalization, not fuzzy — won't catch a
  heavily reworded duplicate.
- Offset pagination, not keyset — simpler, fine at this scale.

## Time spent

~2–3 hours across 2 sessions.

## With another week

Full-text search, trigram-based fuzzy dedup, rate limiting on bulk ingest,
a minimal read-only dashboard.