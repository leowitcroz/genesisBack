import { Module } from '@nestjs/common';
import { AdmController } from './adm.controller';
import { AdmService } from './adm.service';
import { PrismaModule } from '../prisma/prisma.module'; 

@Module({
  imports: [PrismaModule], 
  controllers: [AdmController],
  providers: [AdmService]
})
export class AdmModule {}