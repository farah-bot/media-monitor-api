import { Module } from '@nestjs/common';
import { MentionsController } from './mentions.controller';
import { MentionsRepository } from './mentions.repository';
import { MentionsService } from './mentions.service';

@Module({
  controllers: [MentionsController],
  providers: [MentionsService, MentionsRepository],
})
export class MentionsModule {}
