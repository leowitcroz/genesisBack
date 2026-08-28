import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// =========================================================================
// ROTINA DIÁRIA DE FATURAMENTO DE ASSINATURAS DE CLIENTES
// Mesmo esqueleto do FaturamentoCronService (cobrança SaaS entre WsDigital e
// as lojas), mas cobrando o cliente final da loja, num dia FIXO do mês
// (1 a 31, livre) em vez de um ciclo rolante de 30 dias.
//
// Sem bloqueio automático nesta entrega: fatura vencida só vira ATRASADO,
// nunca desativa a assinatura — senão a busca de assinaturaAtiva em
// agendamentos.service.ts pararia de achar a assinatura e travaria os
// créditos sem querer.
// =========================================================================
@Injectable()
export class AssinaturasCronService {
  private readonly logger = new Logger(AssinaturasCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async executarRotinaDiaria() {
    await this.gerarFaturasDoDia();
    await this.flagarAtrasados();
  }

  private async gerarFaturasDoDia() {
    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const diasNoMesAtual = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const ehUltimoDiaDoMes = diaAtual === diasNoMesAtual;

    const vencimentoDeHoje = new Date(hoje);
    vencimentoDeHoje.setHours(0, 0, 0, 0);

    // Dia de vencimento livre (1-31): em mês mais curto que o dia escolhido
    // (ex: assinatura no dia 31, mês com 30 dias), cobra no último dia do
    // mês — por isso, no último dia do mês, pega tudo com diaVencimento >=
    // hoje (cobre o dia exato E os "dias que não existem" nesse mês).
    const assinaturas = await this.prisma.assinaturaCliente.findMany({
      where: {
        ativo: true,
        status: 'Ativo',
        diaVencimento: ehUltimoDiaDoMes ? { gte: diaAtual } : diaAtual,
      },
      include: { plano: true },
    });

    let geradas = 0;
    for (const assinatura of assinaturas) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const jaExiste = await tx.faturaAssinatura.findUnique({
            where: {
              assinaturaId_dataVencimento: {
                assinaturaId: assinatura.id,
                dataVencimento: vencimentoDeHoje,
              },
            },
          });
          if (jaExiste) return;

          await tx.faturaAssinatura.create({
            data: {
              tenantId: assinatura.tenantId,
              assinaturaId: assinatura.id,
              valor: assinatura.plano.valorMensal,
              status: 'PENDENTE',
              dataReferencia: hoje,
              dataVencimento: vencimentoDeHoje,
            },
          });

          // Créditos resetam a cada ciclo, independente da fatura anterior
          // ter sido paga — não tem bloqueio automático nesta entrega.
          await tx.assinaturaCliente.update({
            where: { id: assinatura.id },
            data: { creditosUsados: 0 },
          });

          geradas++;
        });
      } catch (erro: any) {
        // P2002 = corrida rara batendo no @@unique — a fatura do ciclo já
        // existe, não é um erro de verdade.
        if (erro?.code !== 'P2002') {
          this.logger.error(`Falha ao gerar fatura da assinatura ${assinatura.id}`, erro);
        }
      }
    }

    this.logger.log(`Faturas de assinatura: ${geradas} gerada(s) de ${assinaturas.length} candidata(s) (dia ${diaAtual}).`);
  }

  private async flagarAtrasados() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const resultado = await this.prisma.faturaAssinatura.updateMany({
      where: { status: 'PENDENTE', dataVencimento: { lt: hoje } },
      data: { status: 'ATRASADO' },
    });

    if (resultado.count > 0) {
      this.logger.warn(`${resultado.count} fatura(s) de assinatura marcada(s) como ATRASADO.`);
    }
  }
}
