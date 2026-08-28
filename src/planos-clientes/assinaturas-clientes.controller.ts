import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AssinaturasClientesService } from './assinaturas-clientes.service';
import { AssinaturasCronService } from './assinaturas-cron.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';
import { TenantId } from '../tenant/tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CriarAssinaturaDto } from './dto/criar-assinatura.dto';
import { TrocarPlanoAssinaturaDto } from './dto/trocar-plano-assinatura.dto';

@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@RequireFeatures(SaasFeature.PLANOS_CLIENTES)
@Controller('assinaturas-clientes')
export class AssinaturasClientesController {
  constructor(
    private readonly assinaturasService: AssinaturasClientesService,
    private readonly assinaturasCronService: AssinaturasCronService,
  ) {}

  @Get()
  async listar(@TenantId() tenantId: string) {
    return this.assinaturasService.listarTodos(tenantId);
  }

  @Post()
  async criar(@TenantId() tenantId: string, @CurrentUser() usuario: any, @Body() dto: CriarAssinaturaDto) {
    return this.assinaturasService.criar(tenantId, usuario.id, dto);
  }

  @Patch(':id/trocar-plano')
  async trocarPlano(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TrocarPlanoAssinaturaDto,
  ) {
    return this.assinaturasService.trocarPlano(tenantId, id, dto);
  }

  @Patch(':id/cancelar')
  async cancelar(@TenantId() tenantId: string, @Param('id', ParseIntPipe) id: number) {
    return this.assinaturasService.cancelar(tenantId, id);
  }

  @Get(':id/faturas')
  async obterFaturas(@TenantId() tenantId: string, @Param('id', ParseIntPipe) id: number) {
    return this.assinaturasService.obterFaturas(tenantId, id);
  }

  @Patch('faturas/:faturaId/marcar-pago')
  async marcarPago(@TenantId() tenantId: string, @Param('faturaId') faturaId: string) {
    return this.assinaturasService.marcarPago(tenantId, faturaId);
  }

  // Dispara a rotina de faturamento na hora, sem esperar as 4h — mesmo
  // padrão do POST /adm/faturamento/executar-agora, útil pra testar.
  @Post('executar-cron-agora')
  async executarCronAgora() {
    await this.assinaturasCronService.executarRotinaDiaria();
    return { message: 'Rotina de faturamento de assinaturas executada.' };
  }
}
