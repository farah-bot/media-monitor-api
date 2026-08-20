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

export interface SearchParams {
  q?: string;
  source?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
  includeDuplicates: boolean;
}

export interface MentionRow {
  id: string;
  external_id: string;
  source: string;
  title: string | null;
  content: string;
  url: string | null;
  author: string | null;
  published_at: Date | null;
  engagement: number;
  duplicate_of_id: string | null;
}

export interface StatRow {
  key: string;
  count: number;
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

  // cari baris lain dgn content_hash sama (bukan diri sendiri, bukan yg udah duplikat)
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

  // upsert per record; (source_normalized, external_id) jadi idempotency key
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

  async search(
    params: SearchParams,
  ): Promise<{ data: MentionRow[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (!params.includeDuplicates) {
      conditions.push('duplicate_of_id IS NULL');
    }
    if (params.q) {
      values.push(`%${params.q}%`);
      conditions.push(
        `(title ILIKE $${values.length} OR content_clean ILIKE $${values.length})`,
      );
    }
    if (params.source) {
      values.push(params.source);
      conditions.push(`source_normalized = $${values.length}`);
    }
    if (params.from) {
      values.push(params.from);
      conditions.push(`published_at >= $${values.length}`);
    }
    if (params.to) {
      values.push(params.to);
      conditions.push(`published_at <= $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (params.page - 1) * params.limit;

    values.push(params.limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const dataQuery = `
      SELECT id, external_id, source_normalized AS source, title, content_clean AS content,
             url, author, published_at, engagement, duplicate_of_id
      FROM mentions
      ${where}
      ORDER BY published_at DESC NULLS LAST, id ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const countQuery = `SELECT COUNT(*)::int AS total FROM mentions ${where}`;

    const [dataRes, countRes] = await Promise.all([
      this.pool.query<MentionRow>(dataQuery, values),
      this.pool.query<{ total: number }>(
        countQuery,
        values.slice(0, values.length - 2),
      ),
    ]);

    return { data: dataRes.rows, total: countRes.rows[0].total };
  }

  async statsBySource(): Promise<StatRow[]> {
    const res = await this.pool.query<StatRow>(
      `SELECT source_normalized AS key, COUNT(*)::int AS count
       FROM mentions
       WHERE duplicate_of_id IS NULL
       GROUP BY source_normalized
       ORDER BY count DESC`,
    );
    return res.rows;
  }

  async statsByDay(): Promise<StatRow[]> {
    const res = await this.pool.query<StatRow>(
      `SELECT COALESCE(date_trunc('day', published_at)::date::text, 'unknown') AS key,
              COUNT(*)::int AS count
       FROM mentions
       WHERE duplicate_of_id IS NULL
       GROUP BY 1
       ORDER BY 1`,
    );
    return res.rows;
  }
}
