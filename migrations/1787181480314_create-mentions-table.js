/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

  pgm.sql(`
    CREATE TABLE mentions (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id        TEXT NOT NULL,
      source_raw         TEXT NOT NULL,
      source_normalized  TEXT NOT NULL,
      title              TEXT,
      content_raw        TEXT,
      content_clean      TEXT NOT NULL,
      url                TEXT,
      author             TEXT,
      published_at       TIMESTAMPTZ,
      engagement         INTEGER NOT NULL DEFAULT 0,
      content_hash       TEXT NOT NULL,
      duplicate_of_id    UUID REFERENCES mentions(id),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source_normalized, external_id)
    );
  `);

  pgm.sql(`CREATE INDEX idx_mentions_published_at ON mentions (published_at DESC NULLS LAST);`);
  pgm.sql(`CREATE INDEX idx_mentions_source ON mentions (source_normalized);`);
  pgm.sql(`CREATE INDEX idx_mentions_content_hash ON mentions (content_hash);`);
  pgm.sql(`CREATE INDEX idx_mentions_title_trgm ON mentions USING gin (title gin_trgm_ops);`);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS mentions;`);
};
