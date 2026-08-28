import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanosService } from './planos.service';
import { PlanosController } from './planos.controller';
import { AssinaturasClientesService } from './assinaturas-clientes.service';
import { AssinaturasClientesController } from './assinaturas-clientes.controller';
import { AssinaturasCronService } from './assinaturas-cron.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlanosController, AssinaturasClientesController],
  providers: [PlanosService, AssinaturasClientesService, AssinaturasCronService],
})
export class PlanosClientesModule {}
