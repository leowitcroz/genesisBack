import { Module } from '@nestjs/common';
import { AgendamentosService } from './agendamentos.service';
import { AgendamentosController } from './agendamentos.controller';

@Module({
  providers: [AgendamentosService],
  controllers: [AgendamentosController]
})
export class AgendamentosModule {}
