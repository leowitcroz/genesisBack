import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { WhatsappCronService } from './whatsapp-cron.service';
import { WhatsappController } from './whatsapp.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappTemplatesService, WhatsappCronService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
