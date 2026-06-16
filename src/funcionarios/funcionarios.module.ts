import { Module } from '@nestjs/common';
import { FuncionariosService } from './funcionarios.service';
import { FuncionariosController } from './funcionarios.controller';
import { PrismaModule } from '../prisma/prisma.module'; // <-- IMPORTANTE: Caminho do seu PrismaModule

@Module({
  imports: [PrismaModule], // <-- Adicione aqui para o service enxergar o Prisma
  controllers: [FuncionariosController],
  providers: [FuncionariosService],
  exports: [FuncionariosService], // É uma boa prática exportar, caso o AgendamentosModule precise buscar dados do funcionário no futuro
})
export class FuncionariosModule {}