import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MentionRecordDto {
  @IsString()
  @IsNotEmpty()
  external_id!: string;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsOptional()
  title?: string | null;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  url?: string | null;

  @IsOptional()
  author?: string | null;

  @IsOptional()
  published_at?: string | number | null;

  @IsOptional()
  engagement?: string | number;
}
