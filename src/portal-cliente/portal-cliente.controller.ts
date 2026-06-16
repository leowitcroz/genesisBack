import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { PortalClienteService } from './portal-cliente.service';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IsPublic } from '../decorator/public.decorator';

@Controller('portal-cliente')
export class PortalClienteController {
    constructor(private readonly portalClienteService: PortalClienteService) {}

    @IsPublic() // Permite acessar sem token JWT
    @Post('registro')
    async registrar(
        @TenantId() tenantId: string, // O header x-tenant-id do front
        @Body() body: any
    ) {
        return this.portalClienteService.registrarCliente(tenantId, body);
    }

    @IsPublic()
    @Post('login')
    async login(
        @TenantId() tenantId: string,
        @Body() body: { email: string; senha: string }
    ) {
        return this.portalClienteService.loginCliente(tenantId, body.email, body.senha);
    }

    @UseGuards(JwtAuthGuard) // Exige que o cliente esteja logado
    @Get('perfil')
    async obterMeuPerfil(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any
    ) {
        // usuarioLogado.sub é o ID que colocamos no token
        return this.portalClienteService.obterPerfilCompleto(tenantId, usuarioLogado.sub);
    }
}