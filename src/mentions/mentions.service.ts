import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MentionRecordDto } from './dto/bulk-ingest.dto';
import { SearchMentionsDto, StatsQueryDto } from './dto/search-mentions.dto';
import { MentionsRepository } from './mentions.repository';
import {
  hashContent,
  normalizeSource,
  parseEngagement,
  parsePublishedAt,
  stripHtml,
} from './normalize';

export interface BulkIngestSummary {
  received: number;
  inserted: number;
  updated: number;
  flagged_duplicate: number;
  skipped_invalid: number;
  errors: { index: number; reason: string }[];
}

@Injectable()
export class MentionsService {
  constructor(private readonly repo: MentionsRepository) {}

  async bulkIngest(rawRecords: unknown[]): Promise<BulkIngestSummary> {
    const summary: BulkIngestSummary = {
      received: rawRecords.length,
      inserted: 0,
      updated: 0,
      flagged_duplicate: 0,
      skipped_invalid: 0,
      errors: [],
    };

    // validasi dulu, record invalid di-skip bukan bikin gagal semua
    const toProcess: { index: number; dto: MentionRecordDto }[] = [];
    for (let i = 0; i < rawRecords.length; i++) {
      const dto = plainToInstance(MentionRecordDto, rawRecords[i]);
      const violations = await validate(dto);
      if (violations.length > 0) {
        summary.skipped_invalid++;
        summary.errors.push({
          index: i,
          reason: violations
            .map((v) => Object.values(v.constraints ?? {}).join(', '))
            .join('; '),
        });
        continue;
      }
      toProcess.push({ index: i, dto });
    }

    await this.repo.withTransaction(async (client) => {
      for (const { dto } of toProcess) {
        const sourceNormalized = normalizeSource(dto.source);
        const contentClean = stripHtml(dto.content);
        const contentHash = hashContent(dto.title, contentClean);
        const publishedAt = parsePublishedAt(dto.published_at);
        const engagement = parseEngagement(dto.engagement);

        // cek konten sama dari record lain
        const duplicateOfId = await this.repo.findByContentHash(
          client,
          contentHash,
          sourceNormalized,
          dto.external_id,
        );
        if (duplicateOfId) summary.flagged_duplicate++;

        // upsert; (source_normalized, external_id) = idempotency key
        const result = await this.repo.upsert(
          client,
          {
            external_id: dto.external_id,
            source_raw: dto.source,
            source_normalized: sourceNormalized,
            title: dto.title || null,
            content_raw: dto.content,
            content_clean: contentClean,
            url: dto.url || null,
            author: dto.author || null,
            published_at: publishedAt,
            engagement,
            content_hash: contentHash,
          },
          duplicateOfId,
        );

        if (result.inserted) summary.inserted++;
        else summary.updated++;
      }
    });

    return summary;
  }

  async search(query: SearchMentionsDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('"from" must be before "to"');
    }

    const { data, total } = await this.repo.search({
      q: query.q,
      source: query.source ? normalizeSource(query.source) : undefined,
      from,
      to,
      page: query.page,
      limit: query.limit,
      includeDuplicates: query.include_duplicates === 'true',
    });

    return { data, page: query.page, limit: query.limit, total };
  }

  async stats(query: StatsQueryDto) {
    if (query.group_by === 'source') {
      return { group_by: 'source', results: await this.repo.statsBySource() };
    }
    return { group_by: 'day', results: await this.repo.statsByDay() };
  }
}
