import { Controller, Get, Post, Patch, Delete, Body, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { ConectarWhatsappDto } from './dto/conectar-whatsapp.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { TenantId } from '../tenant/tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

// Mesmo padrão de guard + checagem de dono usado em tentant.controller.ts
// (rotas de "minha-vitrine"): só o dono/admin (role 1) da própria loja pode
// ver/mexer na conexão de WhatsApp dela.
@UseGuards(JwtAuthGuard, TenantMatchGuard)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  private validarDono(usuario: any) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode acessar a configuração de WhatsApp.');
    }
  }

  @Get('conexao')
  async obterConexao(@TenantId() tenantId: string, @CurrentUser() usuario: any) {
    this.validarDono(usuario);
    return this.whatsappService.obterConexao(tenantId);
  }

  @Post('conectar')
  async conectar(@TenantId() tenantId: string, @CurrentUser() usuario: any, @Body() dto: ConectarWhatsappDto) {
    this.validarDono(usuario);
    return this.whatsappService.processarCallbackEmbeddedSignup(tenantId, dto);
  }

  @Delete('conexao')
  async desconectar(@TenantId() tenantId: string, @CurrentUser() usuario: any) {
    this.validarDono(usuario);
    await this.whatsappService.desconectar(tenantId);
    return { message: 'WhatsApp desconectado.' };
  }

  @Post('atualizar-templates')
  async atualizarTemplates(@TenantId() tenantId: string, @CurrentUser() usuario: any) {
    this.validarDono(usuario);
    return this.whatsappService.atualizarStatusTemplates(tenantId);
  }

  @Patch('modo-simulado')
  async atualizarModoSimulado(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @Body('modoSimulado') modoSimulado: boolean,
  ) {
    this.validarDono(usuario);
    return this.whatsappService.atualizarModoSimulado(tenantId, modoSimulado);
  }

  @Get('logs')
  async obterLogs(@TenantId() tenantId: string, @CurrentUser() usuario: any, @Query('limite') limite?: string) {
    this.validarDono(usuario);
    return this.whatsappService.obterLogs(tenantId, limite ? parseInt(limite, 10) : undefined);
  }
}
