import { Controller, Post, Patch, Body, HttpCode, HttpStatus, BadRequestException, ForbiddenException, Get, Param, NotFoundException, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantService } from './tenant.service';
import { IsPublic } from '../decorator/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { TenantId } from './tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

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

  // Payload completo pra vitrine pública (landing page) do subdomínio da loja:
  // dados de personalização + banner + amostra de serviços/equipe/planos.
  @IsPublic()
  @Get('vitrine/:subdomain')
  async getVitrine(@Param('subdomain') subdomain: string) {
    return this.tenantService.obterVitrine(subdomain);
  }

  @IsPublic()
  @Get(':id/plano')
  async getTenantPlano(@Param('id') id: string) {
    return this.tenantService.obterPlanoPorId(id);
  }

  // Dados completos da própria vitrine, pro dono editar (não filtra "só
  // ativos" nem limita quantidade de serviços como a versão pública).
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @Get('minha-vitrine')
  async getMinhaVitrine(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode ver esses dados.');
    }
    return this.tenantService.obterMinhaVitrine(tenantId);
  }

  // Permite ao dono/admin configurar o WhatsApp usado no botão de contato da vitrine.
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @Patch('meu-whatsapp')
  async atualizarMeuWhatsapp(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @Body('whatsapp') whatsapp: string
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode alterar esse dado.');
    }
    return this.tenantService.atualizarWhatsapp(tenantId, whatsapp);
  }

  // Permite ao dono/admin personalizar as cores e os dados da vitrine
  // (descrição, endereço, instagram) exibidos no subdomínio da própria loja.
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @Patch('minha-vitrine')
  async atualizarMinhaVitrine(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @Body() body: {
      corPrimaria?: string;
      corSecundaria?: string;
      descricaoLoja?: string;
      endereco?: string;
      instagram?: string;
    }
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode alterar esse dado.');
    }
    return this.tenantService.atualizarVitrine(tenantId, body);
  }

  // Upload do banner da vitrine pública (Cloudinary).
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @UseInterceptors(FileInterceptor('banner'))
  @Post('meu-banner')
  async atualizarMeuBanner(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @UploadedFile() banner?: Express.Multer.File,
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode alterar esse dado.');
    }
    if (!banner) {
      throw new BadRequestException('Envie uma imagem para o banner.');
    }
    return this.tenantService.atualizarBanner(tenantId, banner);
  }
}
