import { 
    Controller, 
    Get, 
    Post, 
    Patch, 
    Delete, 
    Body, 
    Param, 
    Query, 
    UseGuards,
    ForbiddenException,
    BadRequestException
} from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';

@UseGuards(JwtAuthGuard, SaasFeatureGuard)
@RequireFeatures(SaasFeature.FINANCEIRO) // <-- BLINDAGEM TOTAL DO ARQUIVO!
@Controller('financeiro')
export class FinanceiroController {
    constructor(private readonly financeiroService: FinanceiroService) {}

    // Trava global para administradores:
    private validarAdmin(usuarioLogado: any) {
        // Verifica se é Dono/Admin (1) ou Espectador/Sócio (6) - Ajuste conforme seus roles
        if (usuarioLogado.role !== 1 && usuarioLogado.role !== 6) {
            throw new ForbiddenException('Apenas donos/administradores podem acessar o módulo financeiro.');
        }
    }

    // =========================================================================
    // RESUMO GLOBAL (DASHBOARD)
    // =========================================================================
    @Get('resumo')
    async obterResumo(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio?: string, 
        @Query('fim') fim?: string,       
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.obterResumoFinanceiro(tenantId, inicio, fim);
    }

    // =========================================================================
    // LISTAR DESPESAS
    // =========================================================================
    @Get('despesas')
    async listarDespesas(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio: string,
        @Query('fim') fim: string,
        @Query('tipo') tipo?: 'FIXED' | 'VARIABLE'
    ) {
        this.validarAdmin(usuario);
        if (!inicio || !fim) throw new BadRequestException('Datas de início e fim são obrigatórias');
        
        return this.financeiroService.listarDespesas(tenantId, {
            startDate: new Date(inicio),
            endDate: new Date(fim),
            type: tipo
        });
    }

    @Get('equipe')
    async obterRelatorioEquipe(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio: string,
        @Query('fim') fim: string,
    ) {
        this.validarAdmin(usuario);
        if (!inicio || !fim) throw new BadRequestException('Datas de início e fim são obrigatórias');
        
        return this.financeiroService.obterRelatorioEquipe(tenantId, new Date(inicio), new Date(fim));
    }

    @Get('saas/resumo')
    async obterResumoSaaS(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio: string,
        @Query('fim') fim: string,
    ) {
        this.validarAdmin(usuario);
        if (!inicio || !fim) throw new BadRequestException('Datas de início e fim são obrigatórias');
        
        return this.financeiroService.obterResumoFinanceiroSaaS(tenantId, new Date(inicio), new Date(fim));
    }

    @Get('saas/lojas')
    async obterLojasSaaS(
        @CurrentUser() usuario: any
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.obterLojasRelatorioFinanceiro();
    }

    // =========================================================================
    // CRIAR DESPESAS
    // =========================================================================
    @Post('despesas/variavel')
    async criarVariavel(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Body() body: { description: string; amount: number; date: string; isPaid?: boolean }
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.criarDespesaVariavel(tenantId, body);
    }

    @Post('despesas/recorrente')
    async criarRecorrente(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Body() body: { description: string; amount: number; dayOfMonth: number; date: string } 
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.criarDespesaRecorrente(tenantId, body);
    }

    // =========================================================================
    // ATUALIZAR, EDITAR E MUDAR TIPO DE DESPESA
    // =========================================================================
    
    // Edita a despesa inteira (Nome, valor, data)
    @Patch('despesas/:id')
    async atualizarDespesa(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string,
        @Body() body: { description: string; amount: number; date: string; isPaid: boolean }
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.atualizarDespesa(tenantId, id, body);
    }

    // Altera apenas se está pago ou pendente
    @Patch('despesas/:id/status')
    async atualizarStatus(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string,
        @Body('isPaid') isPaid: boolean
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.atualizarStatusPagamento(tenantId, id, isPaid);
    }

    // Altera entre Recorrente (FIXED) e Variável (VARIABLE)
    @Patch('despesas/:id/tipo')
    async alterarTipo(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.alterarTipoDespesa(tenantId, id);
    }

    // =========================================================================
    // DELETAR DESPESA
    // =========================================================================
    @Delete('despesas/:id')
    async deletarDespesa(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.deletarDespesa(tenantId, id);
    }
}