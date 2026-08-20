import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface UpsertMentionInput {
  external_id: string;
  source_raw: string;
  source_normalized: string;
  title: string | null;
  content_raw: string;
  content_clean: string;
  url: string | null;
  author: string | null;
  published_at: Date | null;
  engagement: number;
  content_hash: string;
}

export interface UpsertMentionResult {
  id: string;
  inserted: boolean;
}

@Injectable()
export class MentionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findByContentHash(
    client: PoolClient,
    contentHash: string,
    excludeSourceNormalized: string,
    excludeExternalId: string,
  ): Promise<string | null> {
    const res = await client.query<{ id: string }>(
      `SELECT id FROM mentions
       WHERE content_hash = $1
         AND duplicate_of_id IS NULL
         AND NOT (source_normalized = $2 AND external_id = $3)
       ORDER BY created_at ASC
       LIMIT 1`,
      [contentHash, excludeSourceNormalized, excludeExternalId],
    );
    return res.rows[0]?.id ?? null;
  }

  async upsert(
    client: PoolClient,
    input: UpsertMentionInput,
    duplicateOfId: string | null,
  ): Promise<UpsertMentionResult> {
    const res = await client.query<{ id: string; inserted: boolean }>(
      `INSERT INTO mentions (
         external_id, source_raw, source_normalized, title,
         content_raw, content_clean, url, author,
         published_at, engagement, content_hash, duplicate_of_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (source_normalized, external_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         content_raw = EXCLUDED.content_raw,
         content_clean = EXCLUDED.content_clean,
         url = EXCLUDED.url,
         author = EXCLUDED.author,
         published_at = EXCLUDED.published_at,
         engagement = EXCLUDED.engagement,
         content_hash = EXCLUDED.content_hash,
         duplicate_of_id = EXCLUDED.duplicate_of_id,
         updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`,
      [
        input.external_id,
        input.source_raw,
        input.source_normalized,
        input.title,
        input.content_raw,
        input.content_clean,
        input.url,
        input.author,
        input.published_at,
        input.engagement,
        input.content_hash,
        duplicateOfId,
      ],
    );
    return res.rows[0];
  }
}
