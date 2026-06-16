import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TipoProduto } from '@prisma/client';

@Injectable()
export class ProdutosService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // CRIAR NOVO PRODUTO / CONSUMÍVEL
  // =========================================================================
  async criar(tenantId: string, data: { nome: string; valor: number; estoque?: number; tipo: TipoProduto }) {
    // 1. Verifica se já existe um produto com este nome nesta barbearia específica
    const existe = await this.prisma.produto.findFirst({
      where: { nome: data.nome, tenantId }
    });

    if (existe) {
      throw new ConflictException(`Já existe um item chamado "${data.nome}" no seu estoque.`);
    }

    // 2. Salva no banco de dados
    return await this.prisma.produto.create({
      data: {
        tenantId,
        nome: data.nome,
        valor: Number(data.valor),
        estoque: data.estoque ? Number(data.estoque) : 0,
        tipo: data.tipo // PRODUTO ou CONSUMIVEL
      }
    });
  }


  async realizarVenda(tenantId: string, data: { 
      produtoId: number;
      funcionarioId: number; 
      nomeItem: string; 
      tipoOrigem: TipoProduto; 
      quantidade: number; 
      valorUnitario: number; 
  }) {
    // Usamos o $transaction para garantir que se a venda falhar, o estoque não baixa (e vice-versa)
    return await this.prisma.$transaction(async (tx) => {
      
      // 1. Cria o registro da venda no financeiro
      const venda = await tx.itemVenda.create({
        data: {
          tenantId,
          funcionarioId: data.funcionarioId,
          nomeItem: data.nomeItem,
          tipoOrigem: data.tipoOrigem,
          quantidade: data.quantidade,
          valorUnitario: data.valorUnitario,
        }
      });

      // 2. Se tiver um ID de produto e a quantidade for maior que zero, desconta do estoque
      if (data.produtoId && data.quantidade > 0) {
        await tx.produto.update({
          where: { id: data.produtoId },
          data: { estoque: { decrement: data.quantidade } }
        });
      }

      return venda;
    });
  }


  // =========================================================================
  // LISTAR TODOS OS PRODUTOS DA BARBEARIA
  // =========================================================================
  async listarTodos(tenantId: string) {
    return await this.prisma.produto.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' }
    });
  }

  // =========================================================================
  // ATUALIZAR PRODUTO (Preço, Estoque, Tipo, Nome)
  // =========================================================================
  async atualizar(tenantId: string, id: number, data: { nome?: string; valor?: number; estoque?: number; tipo?: TipoProduto }) {
    // 1. Valida se o produto pertence à barbearia logada
    const produto = await this.prisma.produto.findFirst({
      where: { id, tenantId }
    });

    if (!produto) {
      throw new NotFoundException('Produto não encontrado ou não pertence a este estabelecimento.');
    }

    // Se estiver tentando mudar o nome, verifica se não vai dar conflito com outro existente
    if (data.nome && data.nome !== produto.nome) {
      const conflito = await this.prisma.produto.findFirst({
        where: { nome: data.nome, tenantId }
      });
      if (conflito) throw new ConflictException(`Já existe um item chamado "${data.nome}".`);
    }

    // 2. Atualiza os dados
    return await this.prisma.produto.update({
      where: { id },
      data: {
        ...(data.nome && { nome: data.nome }),
        ...(data.valor !== undefined && { valor: Number(data.valor) }),
        ...(data.estoque !== undefined && { estoque: Number(data.estoque) }),
        ...(data.tipo && { tipo: data.tipo })
      }
    });
  }

  // =========================================================================
  // EXCLUIR PRODUTO
  // =========================================================================
  async deletar(tenantId: string, id: number) {
    const produto = await this.prisma.produto.findFirst({
      where: { id, tenantId }
    });

    if (!produto) {
      throw new NotFoundException('Produto não encontrado.');
    }

    await this.prisma.produto.delete({
      where: { id }
    });

    return { message: 'Produto excluído do estoque com sucesso.' };
  }
}