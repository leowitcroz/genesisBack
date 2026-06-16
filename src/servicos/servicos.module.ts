import { Module } from '@nestjs/common';
import { ServicosService } from './servicos.service';
import { ServicosController } from './servicos.controller';
import { PrismaModule } from '../prisma/prisma.module'; // Ajuste o caminho se necessário

@Module({
  imports: [PrismaModule],
  controllers: [ServicosController],
  providers: [ServicosService]
})
export class ServicosModule {}