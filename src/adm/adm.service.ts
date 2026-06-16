import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanoSaaS } from '@prisma/client';



@Injectable()
export class AdmService {
  constructor(private prisma: PrismaService) {}

  // Busca todos os estabelecimentos da plataforma
  async getAllTenants() {
    return this.prisma.tenant.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Busca todos os funcionários/barbeiros de todas as lojas
  async getAllFuncionarios() {
    return this.prisma.funcionario.findMany({
      orderBy: {
        nome: 'asc',
      },
      // Não trazemos a senha por segurança
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        tenantId: true,
      }
    });
  }

  // Busca todos os clientes finais cadastrados na plataforma
  async getAllClientes() {
    return this.prisma.cliente.findMany({
      orderBy: {
        nome: 'asc',
      },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tenantId: true,
      }
    });
  }

  // =========================================================
  // NOVAS FUNÇÕES PARA GESTÃO DOS TENANTS (LOJAS)
  // =========================================================

  // 1. Atualizar o Plano e Módulos do Cliente
  async atualizarPlanoLoja(tenantId: string, dadosPlano: { 
    planoSaaS: PlanoSaaS; 
    moduloAgendamento?: boolean; 
    moduloFinanceiro?: boolean; 
    moduloProdutos?: boolean;
    moduloVendas?: boolean;
  }) {
    // Verifica se a loja existe antes de atualizar
    const lojaExiste = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!lojaExiste) {
      throw new NotFoundException('Estabelecimento não encontrado no sistema.');
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        planoSaaS: dadosPlano.planoSaaS,
        // Só atualiza os booleanos se eles forem enviados na requisição
        ...(dadosPlano.moduloAgendamento !== undefined && { moduloAgendamento: dadosPlano.moduloAgendamento }),
        ...(dadosPlano.moduloFinanceiro !== undefined && { moduloFinanceiro: dadosPlano.moduloFinanceiro }),
        ...(dadosPlano.moduloProdutos !== undefined && { moduloProdutos: dadosPlano.moduloProdutos }),
        ...(dadosPlano.moduloVendas !== undefined && { moduloVendas: dadosPlano.moduloVendas }),
      },
    });
  }

  // 2. Bloquear ou Desbloquear a Loja
  async alterarStatusLoja(tenantId: string, status: boolean) {
    const lojaExiste = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!lojaExiste) {
      throw new NotFoundException('Estabelecimento não encontrado no sistema.');
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ativo: status,
      },
    });
  }
}