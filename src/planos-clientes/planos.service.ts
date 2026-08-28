import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlanosService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    tenantId: string,
    data: { nome: string; valorMensal: number; qtdCreditos: number; servicoIds: number[] },
  ) {
    return this.prisma.planoAssinatura.create({
      data: {
        tenantId,
        nome: data.nome,
        valorMensal: data.valorMensal,
        qtdCreditos: data.qtdCreditos,
        servicos: { connect: data.servicoIds.map((id) => ({ id })) },
      },
      include: { servicos: { select: { id: true, nome: true } } },
    });
  }

  async listarTodos(tenantId: string) {
    return this.prisma.planoAssinatura.findMany({
      where: { tenantId },
      include: { servicos: { select: { id: true, nome: true } } },
      orderBy: { valorMensal: 'asc' },
    });
  }

  async atualizar(
    tenantId: string,
    id: number,
    data: { nome?: string; valorMensal?: number; qtdCreditos?: number; ativo?: boolean; servicoIds?: number[] },
  ) {
    const plano = await this.prisma.planoAssinatura.findFirst({ where: { id, tenantId } });
    if (!plano) throw new NotFoundException('Pacote não encontrado ou não pertence a este estabelecimento.');

    return this.prisma.planoAssinatura.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.valorMensal !== undefined && { valorMensal: data.valorMensal }),
        ...(data.qtdCreditos !== undefined && { qtdCreditos: data.qtdCreditos }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
        ...(data.servicoIds !== undefined && {
          servicos: { set: data.servicoIds.map((servicoId) => ({ id: servicoId })) },
        }),
      },
      include: { servicos: { select: { id: true, nome: true } } },
    });
  }
}
