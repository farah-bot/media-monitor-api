import { Body, Controller, Post } from '@nestjs/common';
import { MentionsService } from './mentions.service';

@Controller()
export class MentionsController {
  constructor(private readonly service: MentionsService) {}

  @Post('internal/mentions/bulk')
  async bulkIngest(@Body() body: unknown) {
    const records = Array.isArray(body) ? body : [];
    return this.service.bulkIngest(records);
  }
}