import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
                    const anoCriacao = rec.createdAt.getFullYear();
                    const mesCriacao = rec.createdAt.getMonth();
                    const mesAnoCriacao = new Date(anoCriacao, mesCriacao, 1).getTime();
                    const mesAnoAlvo = new Date(ano, mes, 1).getTime();

                    if (mesAnoAlvo < mesAnoCriacao) continue;

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
    // 1. DESPESAS E ENTRADAS MANUAIS
    // =========================================================================
    async criarDespesaVariavel(tenantId: string, data: any) {
        return await this.prisma.despesa.create({
            data: {
                tenantId,
                description: data.description,
                amount: Number(data.amount),
                date: this.normalizarDataParaMeioDia(data.date),
                type: ExpenseType.VARIABLE,
                isPaid: data.isPaid !== undefined ? data.isPaid : true,

                // O VÍNCULO OCORRE AQUI:
                produtoId: data.produtoId ? Number(data.produtoId) : null,
                centroCustoId: data.centroCustoId || null
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
                    createdAt: dataBase
                }
            });

            const anoAtual = dataBase.getFullYear();
            const mesAtual = dataBase.getMonth();

            const jaExiste = await tx.despesa.findFirst({
                where: {
                    tenantId, description: data.description, type: ExpenseType.FIXED,
                    date: { gte: new Date(anoAtual, mesAtual, 1), lte: new Date(anoAtual, mesAtual + 1, 0) }
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
                ...(dados.description !== undefined && { description: dados.description }),
                ...(dados.amount !== undefined && { amount: dados.amount }),
                ...(dados.date !== undefined && { date: this.normalizarDataParaMeioDia(dados.date) }),
                ...(dados.isPaid !== undefined && { isPaid: dados.isPaid }),
                ...(dados.centroCustoId !== undefined && { centroCustoId: dados.centroCustoId }),
            }
        });
    }

    async criarCentroCusto(tenantId: string, dados: { nome: string; tipo?: string }) {
        return await this.prisma.centroCusto.create({
            data: {
                tenantId,
                nome: dados.nome,
                tipo: dados.tipo || 'GERAL',
                status: 'ATIVO'
            }
        });
    }

    async listarCentrosCustoResumidos(tenantId: string) {
        const centros = await this.prisma.centroCusto.findMany({
            where: { tenantId },
            include: {
                entradas: { orderBy: { date: 'desc' } },
                despesas: { orderBy: { date: 'desc' } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return centros.map(centro => {
            const totalEntradas = centro.entradas.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
            const totalDespesas = centro.despesas.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);

            // Une tudo, põe a flag do tipo e ordena por data decrescente
            const todosLancamentos = [
                ...centro.despesas.map(d => ({ ...d, tipoItem: 'DESPESA' })),
                ...centro.entradas.map(e => ({ ...e, tipoItem: 'ENTRADA' }))
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return {
                id: centro.id,
                nome: centro.nome,
                tipo: centro.tipo,
                status: centro.status,
                lancamentos: todosLancamentos, // Agora o card recebe tudo
                total: totalEntradas - totalDespesas
            };
        });
    }

    async deletarCentroCusto(tenantId: string, id: string) {
        const centro = await this.prisma.centroCusto.findUnique({ where: { id, tenantId } });
        if (!centro) throw new NotFoundException('Centro de custo não encontrado.');

        return await this.prisma.$transaction(async (tx) => {
            // 1. Limpa todas as receitas vinculadas a essa comanda
            await tx.entrada.deleteMany({ where: { centroCustoId: id } });

            // 2. Limpa todos os custos vinculados a essa comanda
            await tx.despesa.deleteMany({ where: { centroCustoId: id } });

            // 3. Exclui a comanda em si
            return await tx.centroCusto.delete({ where: { id } });
        });
    }

    async listarTiposComanda(tenantId: string) {
        // Busca os tipos únicos já usados por esse lojista
        const categorias = await this.prisma.centroCusto.findMany({
            where: { tenantId, tipo: { not: null } },
            distinct: ['tipo'],
            select: { tipo: true }
        });

        const tipos = categorias.map(c => c.tipo).filter(t => t.trim() !== '');

        // Se a loja for nova e não tiver nada, devolvemos um padrão genérico
        return tipos.length > 0 ? tipos : ['GERAL', 'PROJETO'];
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
                        where: { tenantId, description: despesa.description, type: 'FIXED', date: { gt: despesa.date } }
                    });
                }
            }
            return await tx.despesa.delete({ where: { id } });
        });
    }

    async criarEntrada(tenantId: string, dados: { description: string; amount: number; date: string | Date; isPaid?: boolean; centroCustoId?: string }) {
        return await this.prisma.entrada.create({
            data: {
                tenantId,
                centroCustoId: dados.centroCustoId,
                description: dados.description,
                amount: dados.amount,
                date: this.normalizarDataParaMeioDia(dados.date),
                isPaid: dados.isPaid !== undefined ? dados.isPaid : true
            }
        });
    }

    async atualizarEntrada(tenantId: string, id: string, dados: any) {
        // 1. Roteamento para Vendas de Produtos (ID numérico)
        if (id.startsWith('venda-')) {
            const realId = parseInt(id.replace('venda-', ''), 10);
            return await this.prisma.itemVenda.update({
                where: { id: realId },
                data: {
                    ...(dados.amount !== undefined && { valorUnitario: dados.amount })
                }
            });
        }

        // 2. Roteamento para Agendamentos (ID numérico)
        if (id.startsWith('agend-')) {
            const realId = parseInt(id.replace('agend-', ''), 10);
            // Atualize conforme os campos que você permite editar em um agendamento concluído
            return await this.prisma.agendamento.update({
                where: { id: realId },
                data: {
                    ...(dados.amount !== undefined && { valor: dados.amount })
                }
            });
        }

        // 3. Roteamento para Entradas Manuais (ID em formato UUID string)
        // Remove o prefixo se existir, ou assume que é o ID limpo
        const realId = id.replace('manual-', '');

        const exists = await this.prisma.entrada.findUnique({
            where: { id: realId, tenantId }
        });

        if (!exists) {
            throw new NotFoundException('Entrada manual não encontrada.');
        }

        return await this.prisma.entrada.update({
            where: { id: realId },
            data: {
                ...(dados.description !== undefined && { description: dados.description }),
                ...(dados.amount !== undefined && { amount: Number(dados.amount) }),
                ...(dados.date !== undefined && { date: this.normalizarDataParaMeioDia(dados.date) }),
                ...(dados.isPaid !== undefined && { isPaid: dados.isPaid }),
                ...(dados.centroCustoId !== undefined && { centroCustoId: dados.centroCustoId }),
            }
        });
    }

    async deletarEntrada(tenantId: string, id: string) {
    // 1. Cancelamento de Venda de Produto/Consumível
    if (id.startsWith('venda-')) {
        const realId = parseInt(id.replace('venda-', ''), 10);
        const venda = await this.prisma.itemVenda.findFirst({ where: { id: realId, tenantId } });
        if (!venda) throw new NotFoundException('Venda não encontrada.');

        return await this.prisma.$transaction(async (tx) => {
            // Devolve o item pro estoque, se ele estiver vinculado a um produto cadastrado
            if (venda.produtoId) {
                await tx.produto.update({
                    where: { id: venda.produtoId },
                    data: { estoque: { increment: venda.quantidade } }
                });
            }
            return await tx.itemVenda.delete({ where: { id: realId } });
        });
    }

    // 2. Agendamentos concluídos não são cancelados por essa rota
    if (id.startsWith('agend-')) {
        throw new BadRequestException('Para cancelar um serviço concluído, use o módulo de Agenda.');
    }

    // 3. Entrada Manual (padrão) — precisa remover o prefixo antes de buscar, senão nunca acha
    const realId = id.replace('manual-', '');
    const exists = await this.prisma.entrada.findUnique({ where: { id: realId, tenantId } });
    if (!exists) throw new NotFoundException('Entrada não encontrada.');
    return await this.prisma.entrada.delete({ where: { id: realId } });
}

    async listarEntradas(tenantId: string, filters: { startDate: Date; endDate: Date }) {
        return await this.prisma.entrada.findMany({
            where: { tenantId, date: { gte: filters.startDate, lte: filters.endDate } },
            orderBy: { date: 'asc' }
        });
    }

    async listarDespesas(tenantId: string, filters: { startDate: Date; endDate: Date; type?: 'FIXED' | 'VARIABLE' }) {
        await this.propagarDespesasRecorrentes(tenantId, filters.startDate, filters.endDate);
        return await this.prisma.despesa.findMany({
            where: {
                tenantId, date: { gte: filters.startDate, lte: filters.endDate },
                ...(filters.type && { type: filters.type })
            },
            orderBy: { date: 'asc' }
        });
    }

    // =========================================================================
    // 🚀 RESUMOS FINANCEIROS (COM BLINDAGEM ANTI-NAN)
    // =========================================================================
    async obterResumoFinanceiro(tenantId: string, startDate?: string, endDate?: string) {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();

        const dataInicioReal = startDate
            ? new Date(startDate + 'T00:00:00-03:00')
            : new Date(anoAtual, mesAtual, 1, 0, 0, 0);

        const dataFimReal = endDate
            ? new Date(endDate + 'T23:59:59-03:00')
            : new Date(anoAtual, mesAtual + 1, 0, 23, 59, 59);

        // 1. Despesas
        await this.propagarDespesasRecorrentes(tenantId, dataInicioReal, dataFimReal);
        const despesas = await this.prisma.despesa.findMany({
            where: { tenantId, date: { gte: dataInicioReal, lte: dataFimReal } },
            orderBy: { date: 'desc' }
        });
        const despesasPagas = despesas.filter(d => d.isPaid).reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
        const despesasPendentes = despesas.filter(d => !d.isPaid).reduce((acc, d) => acc + (Number(d.amount) || 0), 0);

        // 2. Agendamentos
        const agendamentosConcluidos = await this.prisma.agendamento.findMany({
            where: { tenantId, status: 'concluido', horario: { data: { gte: dataInicioReal, lte: dataFimReal } } }
        });

        let totalAgendamentos = 0;
        const receitaPorPagamento = { DINHEIRO: 0, PIX: 0, CARTAO: 0, MANUAL: 0 };
        const listaAgendamentos = agendamentosConcluidos.map(ag => {
            const valor = Number(ag.valor) || 0;
            totalAgendamentos += valor;
            if (ag.formaPagamento && receitaPorPagamento[ag.formaPagamento] !== undefined) {
                receitaPorPagamento[ag.formaPagamento] += valor;
            }
            // Agendamentos concluídos são sempre considerados recebidos (não têm status de pendência no schema)
            return { id: `agend-${ag.id}`, description: `Serviço: ${ag.servico}`, amount: valor, date: ag.createdAt, tipo: 'AGENDAMENTO', isPaid: true };
        });

        // 3. Vendas de Produtos/Consumíveis
        const listaVendas = await this.prisma.itemVenda.findMany({
            where: { tenantId, dataVenda: { gte: dataInicioReal, lte: dataFimReal } }
        });

        let totalProdutos = 0;
        let totalBebidas = 0;
        const listaVendasFormatada = listaVendas.map(item => {
            const valor = (Number(item.valorUnitario) || 0) * (item.quantidade || 1);
            if (item.tipoOrigem === 'CONSUMIVEL') {
                totalBebidas += valor;
            } else {
                totalProdutos += valor;
            }
            // Vendas já são registradas como recebidas no momento da venda
            return { id: `venda-${item.id}`, description: `Venda: ${item.nomeItem}`, amount: valor, date: item.dataVenda, tipo: 'VENDA_PRODUTO', isPaid: true };
        });

        // 4. Entradas Manuais
        const entradasManuais = await this.prisma.entrada.findMany({
            where: { tenantId, date: { gte: dataInicioReal, lte: dataFimReal } }
        });

        let totalEntradasManuaisPagas = 0;
        let totalEntradasManuaisPendentes = 0;
        const listaManuaisFormatada = entradasManuais.map(e => {
            const valor = Number(e.amount) || 0;
            if (e.isPaid) {
                totalEntradasManuaisPagas += valor;
                receitaPorPagamento.MANUAL += valor;
            } else {
                totalEntradasManuaisPendentes += valor;
            }
            // Aqui o isPaid precisa vir do banco de verdade (é o que estava faltando)
            return { id: `manual-${e.id}`, description: e.description, amount: valor, date: e.date, tipo: 'ENTRADA_MANUAL', isPaid: e.isPaid };
        });

        // 5. Consolidado Final
        const totalVendasGeral = totalProdutos + totalBebidas;
        const totalEntradasReal = totalAgendamentos + totalVendasGeral + totalEntradasManuaisPagas;

        // Unifica tudo na lista de entradas para o front exibir
        const listaCompletaEntradas = [...listaAgendamentos, ...listaVendasFormatada, ...listaManuaisFormatada]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            totais: {
                totalFinanceiro: {
                    receitaBrutaTotal: totalEntradasReal,
                    avulsos: totalAgendamentos,
                    produtos: totalProdutos,
                    planos: 0,
                    bebidas: totalBebidas,
                    manuais: totalEntradasManuaisPagas,
                    pendentesAReceber: totalEntradasManuaisPendentes
                },
                receitaPorPagamento,
                qtdAgendamentosConcluidos: agendamentosConcluidos.length,
                custosOperacionais: {
                    total: despesasPagas + despesasPendentes,
                    pagas: despesasPagas,
                    pendentes: despesasPendentes,
                    lista: despesas
                },
                entradas: { lista: listaCompletaEntradas }, // 👈 Lista completa unificada
                totalComissoes: { total: 0 }
            },
            lucroLiquidoReal: totalEntradasReal - despesasPagas
        };
    }

    async obterResumoFinanceiroSaaS(myTenantId: string, startDate: Date, endDate: Date) {
        await this.propagarDespesasRecorrentes(myTenantId, startDate, endDate);
        const renovacoesPagas = await this.prisma.faturaSaaS.findMany({
            where: {
                status: 'ATIVO',
                dataVencimento: { gte: startDate, lte: endDate },
                tenant: { id: { not: myTenantId } }
            },
            include: { tenant: true }
        });

        let receitaBruta = 0;
        const receitaPorPlano = { BASICO: 0, PRO: 0, ENTERPRISE: 0 };
        const assinaturasAtivas = { BASICO: { qtd: 0, valor: 0 }, PRO: { qtd: 0, valor: 0 }, ENTERPRISE: { qtd: 0, valor: 0 } };

        renovacoesPagas.forEach(fatura => {
            const valorPago = Number(fatura.valor) || 0;
            receitaBruta += valorPago;
            const plano = fatura.tenant.planoSaaS;
            if (receitaPorPlano[plano] !== undefined) {
                receitaPorPlano[plano] += valorPago;
                assinaturasAtivas[plano].qtd += 1;
                assinaturasAtivas[plano].valor += valorPago;
            }
        });

        const despesasInfra = await this.prisma.despesa.findMany({
            where: { tenantId: myTenantId, date: { gte: startDate, lte: endDate } },
            orderBy: { date: 'desc' }
        });

        const totalCustos = despesasInfra.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

        return {
            totais: {
                receitaBrutaTotal: receitaBruta,
                mrrAtual: receitaBruta,
                custosInfraestrutura: { total: totalCustos, lista: despesasInfra },
            },
            receitaPorPlano,
            assinaturasAtivas
        };
    }

    async obterResumoCentroCusto(tenantId: string, centroCustoId: string) {
        const centro = await this.prisma.centroCusto.findUnique({
            where: { id: centroCustoId, tenantId },
            include: {
                despesas: { orderBy: { date: 'desc' } },
                entradas: { orderBy: { date: 'desc' } }
            }
        });

        if (!centro) throw new NotFoundException('Centro de custo não encontrado.');

        let totalDespesasPagas = 0; let totalDespesasPendentes = 0;
        centro.despesas.forEach(d => {
            const valor = Number(d.amount) || 0;
            if (d.isPaid) totalDespesasPagas += valor;
            else totalDespesasPendentes += valor;
        });

        let totalEntradasPagas = 0; let totalEntradasPendentes = 0;
        centro.entradas.forEach(e => {
            const valor = Number(e.amount) || 0;
            if (e.isPaid) totalEntradasPagas += valor;
            else totalEntradasPendentes += valor;
        });

        const lucroAtual = totalEntradasPagas - totalDespesasPagas;
        const lucroProjetado = (totalEntradasPagas + totalEntradasPendentes) - (totalDespesasPagas + totalDespesasPendentes);

        return {
            detalhes: { id: centro.id, nome: centro.nome, tipo: centro.tipo, status: centro.status, criadoEm: centro.createdAt },
            financeiro: {
                entradas: { totalRecebido: totalEntradasPagas, totalAReceber: totalEntradasPendentes, lista: centro.entradas },
                despesas: { totalPago: totalDespesasPagas, totalPendente: totalDespesasPendentes, lista: centro.despesas },
                balanco: { lucroRealizado: lucroAtual, lucroProjetado, rentabilidade: totalEntradasPagas > 0 ? (lucroAtual / totalEntradasPagas) * 100 : 0 }
            }
        };
    }

    async obterRelatorioEquipe(tenantId: string, startDate: Date, endDate: Date) {
        const funcionarios = await this.prisma.funcionario.findMany({ where: { tenantId, ativo: true } });
        const relatorio = await Promise.all(funcionarios.map(async (func) => {
            const agendamentos = await this.prisma.agendamento.aggregate({
                where: { tenantId, funcionarioId: func.id, status: 'concluido', horario: { data: { gte: startDate, lte: endDate } } },
                _count: { id: true }, _sum: { valor: true }
            });
            return {
                barbeiroId: func.id, nomeBarbeiro: func.nome,
                totalServicosRealizados: agendamentos._count.id || 0,
                totalFaturamento: agendamentos._sum.valor || 0
            };
        }));
        return relatorio.sort((a, b) => b.totalServicosRealizados - a.totalServicosRealizados);
    }

    async obterLojasRelatorioFinanceiro() {
        const lojas = await this.prisma.tenant.findMany({
            where: { ativo: true }, select: { id: true, nomeNegocio: true, planoSaaS: true, createdAt: true }
        });
        return lojas.map(loja => ({
            ...loja,
            valorAssinatura: TABELA_PRECOS_SAAS[loja.planoSaaS] || 0,
            criadoEm: loja.createdAt
        }));
    }
}