import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { PrismaModule } from '../prisma/prisma.module'; // Ajuste o caminho de acordo com a sua pasta do Prisma
import { TenantController } from './tentant.controller';

@Module({
  imports: [PrismaModule], // 👈 Dá superpoderes ao módulo para acessar o banco de dados
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService], // Opcional: exporta caso outro módulo precise consultar dados de lojas
})
export class TenantModule {}