import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PlanoSaaS } from '@prisma/client';

// Preço mensal de cada plano, usado só pra saber o valor da fatura de renovação automática.
const TABELA_PRECOS_SAAS: Record<PlanoSaaS, number> = {
  BASICO: 97.00,
  PRO: 197.00,
  ENTERPRISE: 397.00,
};

// =========================================================================
// ROTINA DIÁRIA DE COBRANÇA DO SAAS
// Ciclo de vida de uma loja:
// 1. Loja paga (fatura ATIVO) e o vencimento chega -> gera nova fatura PENDENTE (renovação)
// 2. Loja fica PENDENTE por mais de 7 dias sem o ADM confirmar o pagamento -> bloqueia (tenant.ativo = false)
// O bloqueio em si (impedir acesso da loja e dos clientes dela) já é feito pelo TenantMiddleware,
// que recusa qualquer request pra um tenant com ativo = false. Aqui só cuidamos de quando isso vira true/false.
// =========================================================================
@Injectable()
export class FaturamentoCronService {
  private readonly logger = new Logger(FaturamentoCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async executarRotinaDiaria() {
    await this.gerarRenovacoesDoDia();
    await this.bloquearInadimplentes();
  }

  private async gerarRenovacoesDoDia() {
    const hoje = new Date();

    const tenantsAtivos = await this.prisma.tenant.findMany({
      where: { ativo: true },
      include: { faturasSaaS: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    for (const tenant of tenantsAtivos) {
      const ultimaFatura = tenant.faturasSaaS[0];

      // Sem fatura, ou ainda não está no ciclo pago, ou o vencimento ainda não chegou: nada a fazer
      if (!ultimaFatura || ultimaFatura.status !== 'ATIVO' || ultimaFatura.dataVencimento > hoje) {
        continue;
      }

      await this.prisma.faturaSaaS.create({
        data: {
          tenantId: tenant.id,
          valor: TABELA_PRECOS_SAAS[tenant.planoSaaS] ?? 97.00,
          status: 'PENDENTE',
          dataInicio: hoje,
          dataVencimento: hoje,
        }
      });

      this.logger.log(`Nova fatura PENDENTE gerada para "${tenant.nomeNegocio}" (${tenant.id}).`);
    }
  }

  private async bloquearInadimplentes() {
    const hoje = new Date();
    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

    const tenantsAtivos = await this.prisma.tenant.findMany({
      where: { ativo: true },
      include: { faturasSaaS: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    for (const tenant of tenantsAtivos) {
      const ultimaFatura = tenant.faturasSaaS[0];

      // Se está paga, ou a pendência ainda está dentro do prazo de graça de 7 dias: nada a fazer
      if (!ultimaFatura || ultimaFatura.status === 'ATIVO' || ultimaFatura.dataInicio > seteDiasAtras) {
        continue;
      }

      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { ativo: false }
      });

      await this.prisma.faturaSaaS.update({
        where: { id: ultimaFatura.id },
        data: { status: 'ATRASADO' }
      });

      this.logger.warn(`"${tenant.nomeNegocio}" (${tenant.id}) bloqueado por inadimplência (7+ dias sem pagar).`);
    }
  }
}
