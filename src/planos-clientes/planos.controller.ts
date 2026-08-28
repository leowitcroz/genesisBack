import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PlanosService } from './planos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';
import { TenantId } from '../tenant/tenant.decorator';
import { CriarPlanoDto } from './dto/criar-plano.dto';
import { AtualizarPlanoDto } from './dto/atualizar-plano.dto';

@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@RequireFeatures(SaasFeature.PLANOS_CLIENTES)
@Controller('planos-clientes')
export class PlanosController {
  constructor(private readonly planosService: PlanosService) {}

  @Post()
  async criar(@TenantId() tenantId: string, @Body() dto: CriarPlanoDto) {
    return this.planosService.criar(tenantId, dto);
  }

  @Get()
  async listar(@TenantId() tenantId: string) {
    return this.planosService.listarTodos(tenantId);
  }

  @Patch(':id')
  async atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarPlanoDto,
  ) {
    return this.planosService.atualizar(tenantId, id, dto);
  }
}
