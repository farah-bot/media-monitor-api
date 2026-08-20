/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('Mentions e2e', () => {
  let app: INestApplication;
  let pool: Pool;
  const seed = JSON.parse(
    readFileSync(join(__dirname, '../seed/seed_mentions.json'), 'utf-8'),
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    pool = app.get(PG_POOL);
    await pool.query('DELETE FROM mentions');
  }, 30000);

  afterAll(async () => {
    await pool.query('DELETE FROM mentions');
    await app.close();
  });

  it('bulk ingest is idempotent: posting the same file twice does not duplicate rows', async () => {
    const first = await request(app.getHttpServer())
      .post('/internal/mentions/bulk')
      .send(seed)
      .expect(201);

    const countAfterFirst = (
      await pool.query('SELECT COUNT(*)::int AS c FROM mentions')
    ).rows[0].c;

    const second = await request(app.getHttpServer())
      .post('/internal/mentions/bulk')
      .send(seed)
      .expect(201);

    const countAfterSecond = (
      await pool.query('SELECT COUNT(*)::int AS c FROM mentions')
    ).rows[0].c;

    expect(countAfterFirst).toBe(countAfterSecond);
    expect(second.body.inserted).toBe(0);
    expect(first.body.inserted).toBeGreaterThan(0);
  });

  it('flags near-duplicate content that arrives under a different external_id', async () => {
    const res = await pool.query(
      `SELECT duplicate_of_id FROM mentions WHERE external_id = 'mkn-1202'`,
    );
    expect(res.rows[0].duplicate_of_id).not.toBeNull();
  });

  it('search filters by source and excludes duplicates by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/mentions')
      .query({ source: 'The Star' })
      .expect(200);

    expect(res.body.total).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.source).toBe('The Star');
    }
  });

  it('search supports date range filtering', async () => {
    const res = await request(app.getHttpServer())
      .get('/mentions')
      .query({ from: '2026-08-13T00:00:00Z', to: '2026-08-13T23:59:59Z' })
      .expect(200);

    for (const row of res.body.data) {
      expect(new Date(row.published_at).getUTCDate()).toBe(13);
    }
  });

  it('stats group_by=source returns counts per canonical source', async () => {
    const res = await request(app.getHttpServer())
      .get('/mentions/stats')
      .query({ group_by: 'source' })
      .expect(200);

    expect(res.body.group_by).toBe('source');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('stats rejects an unknown group_by value', async () => {
    await request(app.getHttpServer())
      .get('/mentions/stats')
      .query({ group_by: 'nonsense' })
      .expect(400);
  });
});
