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
      // 👇 Inclusão obrigatória para o seu Frontend conseguir mostrar as etiquetas de "Pendente" / "Pago"
      include: {
        faturasSaaS: {
          orderBy: { createdAt: 'desc' },
          take: 1, 
        }
      }
    });
  }

  // Busca todos os funcionários/barbeiros de todas as lojas
  async getAllFuncionarios() {
    return this.prisma.funcionario.findMany({
      orderBy: {
        nome: 'asc',
      },
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
  // GESTÃO DOS TENANTS (LOJAS) E RENOVAÇÕES
  // =========================================================

  // 1. Atualizar o Plano, Módulos e o Financeiro (Renovação) do Cliente
  async atualizarPlanoLoja(tenantId: string, dadosPlano: { 
    planoSaaS: PlanoSaaS; 
    moduloAgendamento?: boolean; 
    moduloFinanceiro?: boolean; 
    moduloProdutos?: boolean;
    moduloVendas?: boolean;
    // 👇 Novos campos opcionais para o controle financeiro do Admin Master
    statusFinanceiro?: string; // Ex: 'ATIVO', 'PENDENTE', 'ATRASADO'
    gerarNovaFatura?: boolean; // Passar 'true' quando for uma renovação mensal
    valorFatura?: number;      // O valor que foi cobrado nesta renovação
  }) {
    const lojaExiste = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!lojaExiste) {
      throw new NotFoundException('Estabelecimento não encontrado no sistema.');
    }

    // Executamos tudo dentro de uma transação para proteger a integridade dos dados
    return await this.prisma.$transaction(async (tx) => {
      
      // A. Atualiza as permissões e o plano da loja (O que você já tinha feito)
      const tenantAtualizado = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          planoSaaS: dadosPlano.planoSaaS,
          ...(dadosPlano.moduloAgendamento !== undefined && { moduloAgendamento: dadosPlano.moduloAgendamento }),
          ...(dadosPlano.moduloFinanceiro !== undefined && { moduloFinanceiro: dadosPlano.moduloFinanceiro }),
          ...(dadosPlano.moduloProdutos !== undefined && { moduloProdutos: dadosPlano.moduloProdutos }),
          ...(dadosPlano.moduloVendas !== undefined && { moduloVendas: dadosPlano.moduloVendas }),
        },
      });

      const hoje = new Date();

      // B. Cria um NOVO registro no histórico de renovação
      if (dadosPlano.gerarNovaFatura) {
        const vencimento = new Date();
        vencimento.setDate(vencimento.getDate() + 30); // Projeta o próximo vencimento para 30 dias

        await tx.faturaSaaS.create({
          data: {
            tenantId: tenantId,
            valor: dadosPlano.valorFatura || 99.90, // Usa o valor enviado ou o padrão
            status: dadosPlano.statusFinanceiro || 'ATIVO', // Se está gerando, normalmente já entra como ATIVO
            dataInicio: hoje,
            dataVencimento: vencimento,
            dataPagamento: dadosPlano.statusFinanceiro === 'ATIVO' ? hoje : null,
          }
        });
      } 
      
      // C. Se não mandou gerar nova, mas mandou mudar o status (Ex: Dar baixa manual em uma fatura PENDENTE)
      else if (dadosPlano.statusFinanceiro) {
        const ultimaFatura = await tx.faturaSaaS.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'desc' }
        });

        if (ultimaFatura) {
          await tx.faturaSaaS.update({
            where: { id: ultimaFatura.id },
            data: {
              status: dadosPlano.statusFinanceiro,
              // Grava a data de hoje apenas se estiver mudando para ATIVO agora
              dataPagamento: dadosPlano.statusFinanceiro === 'ATIVO' && ultimaFatura.status !== 'ATIVO' 
                ? hoje 
                : ultimaFatura.dataPagamento
            }
          });
        }
      }

      return tenantAtualizado;
    });
  }

  // 2. Bloquear ou Desbloquear a Loja (Acesso ao Sistema)
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