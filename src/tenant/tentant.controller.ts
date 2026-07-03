import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException, Get, Param, NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { IsPublic } from '../decorator/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService, private prisma: PrismaService) { }

  @Post('registrar-loja')
  @HttpCode(HttpStatus.CREATED)
  @IsPublic()
  async registrarLoja(@Body() body: any) {
    // Validação básica de payload
    if (!body.nomeNegocio || !body.subdomain || !body.email || !body.password) {
      throw new BadRequestException('Todos os campos (Nome, Subdomínio, E-mail e Senha) são obrigatórios.');
    }

    return this.tenantService.cadastrarLojaSaaS(body);
  }

  @IsPublic()
  @Get('info/:subdomain')
  async getTenantInfo(@Param('subdomain') subdomain: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain },
      select: { id: true, nomeNegocio: true }
    });

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    return tenant;
  }

  @IsPublic()
  @Get(':id/plano')
  async getTenantPlano(@Param('id') id: string) {
    return this.tenantService.obterPlanoPorId(id);
  }
}