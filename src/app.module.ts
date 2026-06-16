import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AgendamentosModule } from './agendamentos/agendamentos.module';
import { ClientesModule } from './clientes/cliente.module';
import { AuthModule } from './auth/auth.module';
import { FuncionariosModule } from './funcionarios/funcionarios.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { TenantModule } from './tenant/tentatn.module';
import { AdmModule } from './adm/adm.module';
import { PortalClienteModule } from './portal-cliente/portal-cliente.module';
import { ServicosModule } from './servicos/servicos.module';
import { ProdutosModule } from './produtos/produtos.module';

@Module({
  imports: [
    PrismaModule, 
    TenantModule,
    AgendamentosModule,
    ClientesModule,
    AuthModule,
    FuncionariosModule,
    FinanceiroModule,
    AdmModule,
    PortalClienteModule,
    ServicosModule,
    ProdutosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      // 👇 DEIXAMOS AS ROTAS DE CRIAÇÃO E LOGIN LIVRES DO MIDDLEWARE
      .exclude(
        { path: 'tenants/registrar-loja', method: RequestMethod.POST },
        { path: 'auth/login', method: RequestMethod.POST },
        // { path: 'auth/register', method: RequestMethod.POST }
      )
      .forRoutes('*'); // Aplica a interceptação para todo o resto (rotas logadas)
  }
}