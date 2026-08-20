import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SearchMentionsDto, StatsQueryDto } from './dto/search-mentions.dto';
import { MentionsService } from './mentions.service';

@Controller()
export class MentionsController {
  constructor(private readonly service: MentionsService) {}

  @Post('internal/mentions/bulk')
  async bulkIngest(@Body() body: unknown) {
    const records = Array.isArray(body) ? body : [];
    return this.service.bulkIngest(records);
  }

  @Get('mentions')
  async search(@Query() query: SearchMentionsDto) {
    return this.service.search(query);
  }

  @Get('mentions/stats')
  async stats(@Query() query: StatsQueryDto) {
    return this.service.stats(query);
  }
}
