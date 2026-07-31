import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TipoProduto, FormaPagamento, ExpenseType } from '@prisma/client';

@Injectable()
export class ProdutosService {
  constructor(private readonly prisma: PrismaService) { }

  // =========================================================================
  // CRIAR NOVO PRODUTO COM ESTOQUE COMPLEXO (ATRIBUTOS DINÂMICOS)
  // =========================================================================
  async criar(tenantId: string, data: { nome: string; valor: number; valorCompra?: number; estoque?: number; tipo: TipoProduto; caracteristicas?: any }) {
    return await this.prisma.produto.create({
      data: {
        tenantId,
        nome: data.nome,
        valor: Number(data.valor),
        valorCompra: data.valorCompra ? Number(data.valorCompra) : 0,
        estoque: data.estoque ? Number(data.estoque) : 0,
        tipo: data.tipo,
        caracteristicas: data.caracteristicas || {} // <-- Guarda as propriedades dinâmicas
      }
    });
}

  // =========================================================================
  // REALIZAR VENDA INTEGRADA AO DRE / COMANDA
  // =========================================================================
  async realizarVenda(tenantId: string, data: {
    produtoId: number;
    funcionarioId: number;
    nomeItem: string;
    tipoOrigem: TipoProduto;
    quantidade: number;
    valorUnitario: number;
    formaPagamento: FormaPagamento;
    centroCustoId?: string;
    valorRecebido?: number; // Quando tem carro na troca, é a diferença (o que realmente entrou em caixa)
    carroTroca?: {
      nome: string;
      valorCompra: number; // Valor dado ao cliente pelo carro dele (vira o custo de aquisição do novo item)
      valorVenda: number;  // Quanto pretende revender o carro recebido
      despesas?: number;   // Custo já conhecido no momento da troca (opcional)
    };
}) {
    return await this.prisma.$transaction(async (tx) => {

        // 1. Regista a Venda Avulsa no sistema
        const venda = await tx.itemVenda.create({
            data: {
                tenantId,
                funcionarioId: data.funcionarioId,
                nomeItem: data.nomeItem,
                tipoOrigem: data.tipoOrigem,
                quantidade: data.quantidade,
                valorUnitario: data.valorUnitario,
                formaPagamento: data.formaPagamento,
                produtoId: data.produtoId || null, // <-- NOVO: agora fica salvo pra poder estornar depois
            }
        });

        // 2. Abate do Stock
        if (data.produtoId && data.quantidade > 0) {
            await tx.produto.update({
                where: { id: data.produtoId },
                data: { estoque: { decrement: data.quantidade } }
            });
        }

        // 3. Carro na troca: cadastra automaticamente o carro recebido como novo item no estoque
        if (data.carroTroca && data.carroTroca.nome) {
            const carroRecebido = await tx.produto.create({
                data: {
                    tenantId,
                    nome: data.carroTroca.nome,
                    valor: Number(data.carroTroca.valorVenda) || 0,
                    valorCompra: Number(data.carroTroca.valorCompra) || 0,
                    tipo: 'PRODUTO',
                    estoque: 1,
                }
            });

            if (data.carroTroca.despesas && Number(data.carroTroca.despesas) > 0) {
                await tx.despesa.create({
                    data: {
                        tenantId,
                        produtoId: carroRecebido.id,
                        description: `[Custo] ${carroRecebido.nome} - Despesa registrada na troca`,
                        amount: Number(data.carroTroca.despesas),
                        date: new Date(),
                        type: ExpenseType.VARIABLE,
                        isPaid: true,
                    }
                });
            }
        }

        // 4. Se o utilizador escolheu um DRE (ex: comanda do Carro), injeta o dinheiro lá!
        // Usa valorRecebido quando informado (ex: diferença de uma troca) — senão, o valor cheio da venda
        if (data.centroCustoId) {
            const valorTotal = data.valorRecebido !== undefined
                ? Number(data.valorRecebido)
                : Number(data.valorUnitario) * Number(data.quantidade);

            await tx.entrada.create({
                data: {
                    tenantId,
                    centroCustoId: data.centroCustoId,
                    description: `Venda de Estoque: ${data.nomeItem}`,
                    amount: valorTotal,
                    date: new Date(),
                    isPaid: true
                }
            });
        }

        return venda;
    });
}

  async listarTodos(tenantId: string) {
    return await this.prisma.produto.findMany({
      where: { tenantId },
      include: {
        despesas: {
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { nome: 'asc' }
    });
  }

  async atualizar(tenantId: string, id: number, data: { nome?: string; valor?: number; valorCompra?: number; estoque?: number; tipo?: TipoProduto; caracteristicas?: any }) {
    const produto = await this.prisma.produto.findFirst({ where: { id, tenantId } });
    if (!produto) throw new NotFoundException('Produto não encontrado.');

    return await this.prisma.produto.update({
      where: { id },
      data: {
        ...(data.nome && { nome: data.nome }),
        ...(data.valor !== undefined && { valor: Number(data.valor) }),
        ...(data.valorCompra !== undefined && { valorCompra: Number(data.valorCompra) }),
        ...(data.estoque !== undefined && { estoque: Number(data.estoque) }),
        ...(data.tipo && { tipo: data.tipo }),
        ...(data.caracteristicas !== undefined && { caracteristicas: data.caracteristicas })
      }
    });
  }

  async deletar(tenantId: string, id: number) {
    const produto = await this.prisma.produto.findFirst({ where: { id, tenantId } });
    if (!produto) throw new NotFoundException('Produto não encontrado.');
    await this.prisma.produto.delete({ where: { id } });
    return { message: 'Produto excluído do estoque com sucesso.' };
  }
  
}