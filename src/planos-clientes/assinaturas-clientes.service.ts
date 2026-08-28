import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { proximaDataVencimento } from './vencimento.util';

@Injectable()
export class AssinaturasClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async listarTodos(tenantId: string) {
    return this.prisma.assinaturaCliente.findMany({
      where: { tenantId },
      include: {
        cliente: { select: { nome: true, telefone: true } },
        plano: true,
        faturas: { orderBy: { dataVencimento: 'desc' }, take: 1 },
      },
      orderBy: { dataInicio: 'desc' },
    });
  }

  async criar(
    tenantId: string,
    funcionarioId: number | undefined,
    dto: { clienteId: number; planoId: number; diaVencimento: number },
  ) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id: dto.clienteId, tenantId } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado neste estabelecimento.');

    const plano = await this.prisma.planoAssinatura.findFirst({
      where: { id: dto.planoId, tenantId, ativo: true },
    });
    if (!plano) throw new NotFoundException('Pacote não encontrado ou inativo.');

    // clienteId é @unique no schema — um cliente só tem UMA linha pra sempre,
    // mesmo cancelada. Reativação/troca passa por trocarPlano(), nunca por
    // um novo POST.
    const existente = await this.prisma.assinaturaCliente.findUnique({
      where: { clienteId: dto.clienteId },
    });
    if (existente) {
      throw new ConflictException(
        'Este cliente já teve uma assinatura cadastrada. Use "trocar plano" para reativar ou alterar.',
      );
    }

    const hoje = new Date();
    const dataFim = new Date(hoje);
    dataFim.setFullYear(dataFim.getFullYear() + 1);
    const primeiroVencimento = proximaDataVencimento(dto.diaVencimento, hoje);

    return this.prisma.$transaction(async (tx) => {
      const assinatura = await tx.assinaturaCliente.create({
        data: {
          tenantId,
          clienteId: dto.clienteId,
          planoId: dto.planoId,
          funcionarioId: funcionarioId ?? null,
          diaVencimento: dto.diaVencimento,
          limiteCreditos: plano.qtdCreditos,
          creditosUsados: 0,
          dataInicio: hoje,
          dataFim,
          ativo: true,
          status: 'Ativo',
        },
      });

      await tx.faturaAssinatura.create({
        data: {
          tenantId,
          assinaturaId: assinatura.id,
          valor: plano.valorMensal,
          status: 'PENDENTE',
          dataReferencia: hoje,
          dataVencimento: primeiroVencimento,
        },
      });

      return tx.assinaturaCliente.findUnique({
        where: { id: assinatura.id },
        include: {
          cliente: { select: { nome: true, telefone: true } },
          plano: true,
          faturas: true,
        },
      });
    });
  }

  async trocarPlano(tenantId: string, id: number, dto: { planoId?: number; diaVencimento?: number }) {
    const assinatura = await this.prisma.assinaturaCliente.findFirst({ where: { id, tenantId } });
    if (!assinatura) throw new NotFoundException('Assinatura não encontrada.');

    let novoLimite = assinatura.limiteCreditos;
    if (dto.planoId !== undefined) {
      const plano = await this.prisma.planoAssinatura.findFirst({
        where: { id: dto.planoId, tenantId, ativo: true },
      });
      if (!plano) throw new NotFoundException('Pacote não encontrado ou inativo.');
      novoLimite = plano.qtdCreditos;
    }

    return this.prisma.assinaturaCliente.update({
      where: { id },
      data: {
        ...(dto.planoId !== undefined && { planoId: dto.planoId, limiteCreditos: novoLimite }),
        ...(dto.diaVencimento !== undefined && { diaVencimento: dto.diaVencimento }),
        // Troca de plano (ou reativação de um cliente cancelado) sempre
        // conta como um novo ciclo — créditos zeram, assinatura volta a valer.
        creditosUsados: 0,
        ativo: true,
        status: 'Ativo',
      },
      include: {
        cliente: { select: { nome: true, telefone: true } },
        plano: true,
      },
    });
  }

  async cancelar(tenantId: string, id: number) {
    const assinatura = await this.prisma.assinaturaCliente.findFirst({ where: { id, tenantId } });
    if (!assinatura) throw new NotFoundException('Assinatura não encontrada.');

    return this.prisma.assinaturaCliente.update({
      where: { id },
      data: { ativo: false, status: 'Cancelado' },
    });
  }

  async obterFaturas(tenantId: string, assinaturaId: number) {
    const assinatura = await this.prisma.assinaturaCliente.findFirst({
      where: { id: assinaturaId, tenantId },
    });
    if (!assinatura) throw new NotFoundException('Assinatura não encontrada.');

    return this.prisma.faturaAssinatura.findMany({
      where: { assinaturaId },
      orderBy: { dataVencimento: 'desc' },
    });
  }

  async marcarPago(tenantId: string, faturaId: string) {
    const fatura = await this.prisma.faturaAssinatura.findFirst({ where: { id: faturaId, tenantId } });
    if (!fatura) throw new NotFoundException('Fatura não encontrada.');
    if (fatura.status === 'PAGO') throw new BadRequestException('Esta fatura já está paga.');

    return this.prisma.$transaction(async (tx) => {
      const faturaAtualizada = await tx.faturaAssinatura.update({
        where: { id: faturaId },
        data: { status: 'PAGO', dataPagamento: new Date() },
      });

      // Confirmar o pagamento também renova os créditos — além do reset
      // automático que o cron já faz no dia de vencimento, isso cobre o caso
      // de marcar como pago fora do fluxo normal do ciclo.
      await tx.assinaturaCliente.update({
        where: { id: fatura.assinaturaId },
        data: { creditosUsados: 0 },
      });

      return faturaAtualizada;
    });
  }
}
