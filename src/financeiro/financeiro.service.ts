import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseType } from '@prisma/client';

const TABELA_PRECOS_SAAS = {
  BASICO: 97.00,
  PRO: 197.00,
  ENTERPRISE: 397.00,
};

@Injectable()
export class FinanceiroService {
    constructor(private readonly prisma: PrismaService) { }

    private normalizarDataParaMeioDia(dataInput: string | Date): Date {
        const data = new Date(dataInput);
        data.setUTCHours(12, 0, 0, 0); 
        return data;
    }

    // =========================================================================
    // ⚙️ MOTOR DE PROPAGAÇÃO AUTOMÁTICA DE DESPESAS FIXAS
    // =========================================================================
    private async propagarDespesasRecorrentes(tenantId: string, startDate: Date, endDate: Date) {
        const recorrentes = await this.prisma.despesaRecorrente.findMany({
            where: { tenantId, active: true }
        });

        if (recorrentes.length === 0) return;

        const startAno = startDate.getFullYear();
        const startMes = startDate.getMonth();
        const endAno = endDate.getFullYear();
        const endMes = endDate.getMonth();

        for (let ano = startAno; ano <= endAno; ano++) {
            const mesInicial = (ano === startAno) ? startMes : 0;
            const mesFinal = (ano === endAno) ? endMes : 11;

            for (let mes = mesInicial; mes <= mesFinal; mes++) {
                for (const rec of recorrentes) {
                    
                    // 🛑 TRAVA DO PASSADO: Só gera se o mês/ano alvo for >= ao mês/ano de criação do molde
                    const anoCriacao = rec.createdAt.getFullYear();
                    const mesCriacao = rec.createdAt.getMonth();
                    const mesAnoCriacao = new Date(anoCriacao, mesCriacao, 1).getTime();
                    const mesAnoAlvo = new Date(ano, mes, 1).getTime();

                    if (mesAnoAlvo < mesAnoCriacao) {
                        continue; // É passado! Pula essa despesa e não gera nada.
                    }

                    // Se passou pela trava, verifica se a conta do mês já existe
                    const jaExiste = await this.prisma.despesa.findFirst({
                        where: {
                            tenantId,
                            description: rec.description,
                            type: ExpenseType.FIXED,
                            date: {
                                gte: new Date(ano, mes, 1),
                                lte: new Date(ano, mes + 1, 0)
                            }
                        }
                    });

                    // Se não existe, cria a parcela do mês como pendente
                    if (!jaExiste) {
                        const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
                        const diaFinal = Math.min(rec.dayOfMonth, ultimoDiaDoMes);
                        const dataSegura = new Date(Date.UTC(ano, mes, diaFinal, 12, 0, 0));

                        await this.prisma.despesa.create({
                            data: {
                                tenantId,
                                description: rec.description,
                                amount: rec.amount,
                                type: ExpenseType.FIXED,
                                date: dataSegura,
                                isPaid: false 
                            }
                        });
                    }
                }
            }
        }
    }

    // =========================================================================
    // 1. DESPESAS VARIÁVEIS E RECORRENTES (CRIAÇÃO)
    // =========================================================================
    async criarDespesaVariavel(tenantId: string, data: { description: string; amount: number; date: string | Date; isPaid?: boolean }) {
        return await this.prisma.despesa.create({
            data: {
                tenantId,
                description: data.description,
                amount: data.amount,
                date: this.normalizarDataParaMeioDia(data.date),
                type: ExpenseType.VARIABLE,
                isPaid: data.isPaid || false
            }
        });
    }

    async criarDespesaRecorrente(tenantId: string, data: { description: string; amount: number; dayOfMonth: number; date: string | Date }) {
        return await this.prisma.$transaction(async (tx) => {
            const dataBase = this.normalizarDataParaMeioDia(data.date);

            const recorrente = await tx.despesaRecorrente.create({
                data: {
                    tenantId,
                    description: data.description,
                    amount: data.amount,
                    dayOfMonth: data.dayOfMonth,
                    active: true,
                    // 👈 Pulo do gato: Forçamos a data de criação baseada na data que o usuário escolheu no calendário
                    createdAt: dataBase 
                }
            });

            // Lança a primeira despesa no mês que o usuário escolheu!
            const anoAtual = dataBase.getFullYear();
            const mesAtual = dataBase.getMonth();

            const jaExiste = await tx.despesa.findFirst({
                where: {
                    tenantId,
                    description: data.description,
                    type: ExpenseType.FIXED,
                    date: {
                        gte: new Date(anoAtual, mesAtual, 1),
                        lte: new Date(anoAtual, mesAtual + 1, 0),
                    }
                }
            });

            if (!jaExiste) {
                const ultimoDiaDoMes = new Date(Date.UTC(anoAtual, mesAtual + 1, 0)).getUTCDate();
                const diaFinal = Math.min(data.dayOfMonth, ultimoDiaDoMes);
                const dataSegura = new Date(Date.UTC(anoAtual, mesAtual, diaFinal, 12, 0, 0));

                await tx.despesa.create({
                    data: {
                        tenantId,
                        description: data.description,
                        amount: data.amount,
                        type: ExpenseType.FIXED,
                        date: dataSegura,
                        isPaid: false
                    }
                });
            }

            return recorrente;
        });
    }

    // =========================================================================
    // 2. ATUALIZAÇÕES E EXCLUSÃO
    // =========================================================================
    async atualizarStatusPagamento(tenantId: string, id: string, isPaid: boolean) {
        const exists = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!exists) throw new NotFoundException('Despesa não encontrada.');
        return await this.prisma.despesa.update({ where: { id }, data: { isPaid } });
    }

    async atualizarDespesa(tenantId: string, id: string, dados: any) {
        const exists = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!exists) throw new NotFoundException('Despesa não encontrada.');
        return this.prisma.despesa.update({
            where: { id },
            data: {
                description: dados.description,
                amount: dados.amount,
                date: this.normalizarDataParaMeioDia(dados.date),
                isPaid: dados.isPaid,
            }
        });
    }

    async alterarTipoDespesa(tenantId: string, id: string) {
        const despesa = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!despesa) throw new NotFoundException('Despesa não encontrada.');
        return this.prisma.despesa.update({
            where: { id },
            data: { type: despesa.type === 'FIXED' ? 'VARIABLE' : 'FIXED' }
        });
    }

    async deletarDespesa(tenantId: string, id: string) {
        const despesa = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!despesa) throw new NotFoundException('Despesa não encontrada');

        return await this.prisma.$transaction(async (tx) => {
            if (despesa.type === 'FIXED') {
                const recorrencia = await tx.despesaRecorrente.findFirst({
                    where: { tenantId, description: despesa.description, amount: despesa.amount }
                });

                if (recorrencia) {
                    await tx.despesaRecorrente.delete({ where: { id: recorrencia.id } });
                    await tx.despesa.deleteMany({
                        where: {
                            tenantId, description: despesa.description, type: 'FIXED', date: { gt: despesa.date }
                        }
                    });
                }
            }
            return await tx.despesa.delete({ where: { id } });
        });
    }

    // =========================================================================
    // 3. LISTAGENS E RESUMOS (DASHBOARDS)
    // =========================================================================
    async listarDespesas(tenantId: string, filters: { startDate: Date; endDate: Date; type?: 'FIXED' | 'VARIABLE' }) {
        await this.propagarDespesasRecorrentes(tenantId, filters.startDate, filters.endDate);

        return await this.prisma.despesa.findMany({
            where: {
                tenantId,
                date: { gte: filters.startDate, lte: filters.endDate },
                ...(filters.type && { type: filters.type })
            },
            orderBy: { date: 'asc' }
        });
    }

   // =========================================================================
    // RESUMO FINANCEIRO DO ESTABELECIMENTO (Agendamentos + Produtos + Range de Data)
    // =========================================================================
    async obterResumoFinanceiro(tenantId: string, startDate?: string, endDate?: string) {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();

        // ⚙️ TRATAMENTO SEGURO DE DATAS (Evita quebra de fuso horário)
        const dataInicioReal = startDate 
            ? new Date(startDate + 'T00:00:00-03:00')
            : new Date(anoAtual, mesAtual, 1, 0, 0, 0);

        const dataFimReal = endDate 
            ? new Date(endDate + 'T23:59:59-03:00')
            : new Date(anoAtual, mesAtual + 1, 0, 23, 59, 59);

        // 1. Propaga as despesas fixas para o período selecionado
        await this.propagarDespesasRecorrentes(tenantId, dataInicioReal, dataFimReal);

        // 2. Busca e contabiliza AGENDAMENTOS CONCLUÍDOS
        const agendamentosConcluidos = await this.prisma.agendamento.findMany({
            where: { tenantId, status: 'concluido', horario: { data: { gte: dataInicioReal, lte: dataFimReal } } }
        });

        let totalAgendamentos = 0;
        const receitaPorPagamento = { DINHEIRO: 0, PIX: 0, CARTAO: 0 };

        agendamentosConcluidos.forEach(ag => {
            const valorConvertido = Number(ag.valor) || 0;
            totalAgendamentos += valorConvertido;
            
            if (ag.formaPagamento && receitaPorPagamento[ag.formaPagamento] !== undefined) {
                receitaPorPagamento[ag.formaPagamento] += valorConvertido;
            }
        });

        // 3. Busca e contabiliza VENDAS DE PRODUTOS / CONSUMÍVEIS
        const listaVendas = await this.prisma.itemVenda.findMany({
            where: { tenantId, dataVenda: { gte: dataInicioReal, lte: dataFimReal } }
            // Como o schema tem o "tipoOrigem" direto na tabela, não precisamos de "include"!
        });

        let totalProdutos = 0;
        let totalBebidas = 0; // Para os CONSUMIVEIS

        listaVendas.forEach(item => {
            const valorTotalItem = Number(item.valorUnitario) * item.quantidade;
            
            // Lemos o Enum direto da sua tabela ItemVenda
            if (item.tipoOrigem === 'CONSUMIVEL') {
                totalBebidas += valorTotalItem;
            } else {
                totalProdutos += valorTotalItem;
            }
        });

        const totalVendasGeral = totalProdutos + totalBebidas;

        // 4. Busca e contabiliza DESPESAS
        const despesas = await this.prisma.despesa.findMany({
            where: { tenantId, date: { gte: dataInicioReal, lte: dataFimReal } },
            orderBy: { date: 'desc' }
        });

        const despesasPagas = despesas.filter(d => d.isPaid).reduce((acc, d) => acc + Number(d.amount), 0);
        const despesasPendentes = despesas.filter(d => !d.isPaid).reduce((acc, d) => acc + Number(d.amount), 0);
        
        // 5. Fechamento de Caixa
        const totalEntradas = totalAgendamentos + totalVendasGeral;
        
        return {
            totais: {
                totalFinanceiro: {
                    receitaBrutaTotal: totalEntradas,
                    avulsos: totalAgendamentos, // Grana dos agendamentos
                    produtos: totalProdutos,    // Grana de pomadas, minoxidil, etc
                    planos: 0,                  // Grana de assinaturas (futuro)
                    bebidas: totalBebidas       // Grana de cervejas, refris, etc
                },
                receitaPorPagamento, // Mostra o que entrou em PIX, Cartão, etc.
                qtdAgendamentosConcluidos: agendamentosConcluidos.length,
                
                custosOperacionais: {
                    total: despesasPagas + despesasPendentes,
                    pagas: despesasPagas,
                    pendentes: despesasPendentes,
                    lista: despesas
                },
                totalComissoes: { total: 0 }
            },
            lucroLiquidoReal: totalEntradas - despesasPagas
        };
    }

    async obterResumoFinanceiroSaaS(myTenantId: string, startDate: Date, endDate: Date) {
        await this.propagarDespesasRecorrentes(myTenantId, startDate, endDate);

        const lojasAtivas = await this.prisma.tenant.findMany({ where: { ativo: true } });

        let receitaBruta = 0;
        const receitaPorPlano = { BASICO: 0, PRO: 0, ENTERPRISE: 0 };
        const assinaturasAtivas = {
            BASICO: { qtd: 0, valor: 0 },
            PRO: { qtd: 0, valor: 0 },
            ENTERPRISE: { qtd: 0, valor: 0 }
        };

        lojasAtivas.forEach(loja => {
            if (loja.id === myTenantId) return; 

            const valorPlano = TABELA_PRECOS_SAAS[loja.planoSaaS] || 0;
            receitaBruta += valorPlano;
            
            if (receitaPorPlano[loja.planoSaaS] !== undefined) {
                receitaPorPlano[loja.planoSaaS] += valorPlano;
                assinaturasAtivas[loja.planoSaaS].qtd += 1;
                assinaturasAtivas[loja.planoSaaS].valor += valorPlano;
            }
        });

        const despesasInfra = await this.prisma.despesa.findMany({
            where: { tenantId: myTenantId, date: { gte: startDate, lte: endDate } },
            orderBy: { date: 'desc' }
        });

        const totalCustos = despesasInfra.reduce((acc, curr) => acc + Number(curr.amount), 0);
        // const taxasGateway = receitaBruta * 0.0499; 

        return {
            totais: {
                receitaBrutaTotal: receitaBruta,
                mrrAtual: receitaBruta,
                custosInfraestrutura: { total: totalCustos, lista: despesasInfra },
                // taxasGateway: taxasGateway
            },
            receitaPorPlano,
            assinaturasAtivas
        };
    }

    // =========================================================================
    // RELATÓRIO SECUNDÁRIO - BARBEARIA (PERFORMANCE DA EQUIPE)
    // =========================================================================
    async obterRelatorioEquipe(tenantId: string, startDate: Date, endDate: Date) {
        // 1. Busca todos os funcionários ativos da loja
        const funcionarios = await this.prisma.funcionario.findMany({
            where: { tenantId, ativo: true }
        });

        // 2. Calcula os serviços e faturamento de cada um
        const relatorio = await Promise.all(funcionarios.map(async (func) => {
            const agendamentos = await this.prisma.agendamento.aggregate({
                where: {
                    tenantId,
                    funcionarioId: func.id,
                    status: 'concluido',
                    horario: { data: { gte: startDate, lte: endDate } }
                },
                _count: { id: true },
                _sum: { valor: true }
            });

            return {
                barbeiroId: func.id,
                nomeBarbeiro: func.nome,
                totalServicosRealizados: agendamentos._count.id || 0,
                totalFaturamento: agendamentos._sum.valor || 0
            };
        }));

        // Retorna ordenado por quem fez mais serviços
        return relatorio.sort((a, b) => b.totalServicosRealizados - a.totalServicosRealizados);
    }

    async obterLojasRelatorioFinanceiro() {
        const lojas = await this.prisma.tenant.findMany({
            where: { ativo: true },
            select: { id: true, nomeNegocio: true, planoSaaS: true, createdAt: true }
        });

        return lojas.map(loja => ({
            ...loja,
            valorAssinatura: TABELA_PRECOS_SAAS[loja.planoSaaS] || 0,
            criadoEm: loja.createdAt
        }));
    }
}