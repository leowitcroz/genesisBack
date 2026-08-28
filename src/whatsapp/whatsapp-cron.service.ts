import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';

// Mesmo padrão de "início/fim do dia no fuso de Brasília" já usado em
// agendamentos.service.ts (listarTodos) — evita o clássico bug de meia-noite
// UTC cortando o dia errado.
function limitesDoDia(data: Date) {
  const iso = data.toISOString().split('T')[0];
  return {
    inicio: new Date(`${iso}T00:00:00-03:00`),
    fim: new Date(`${iso}T23:59:59-03:00`),
  };
}

function amanha() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

@Injectable()
export class WhatsappCronService {
  private readonly logger = new Logger(WhatsappCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // Horário fixo por enquanto (18h véspera / 06h no dia — igual ao sistema
  // atual da cliente) — tunável por tenant é uma extensão futura, não
  // necessária pra esta entrega.
  @Cron('0 0 18 * * *')
  async enviarLembretesVespera() {
    await this.processarLembrete('lembreteVesperaEnviadoEm', 'VESPERA', limitesDoDia(amanha()));
  }

  @Cron('0 0 6 * * *')
  async enviarLembretesDiaDa() {
    await this.processarLembrete('lembreteDiaDaEnviadoEm', 'DIA_DA', limitesDoDia(new Date()));
  }

  @Cron('0 0 7 * * *')
  async enviarMensagensAniversario() {
    const hoje = new Date();
    const candidatos = await this.prisma.cliente.findMany({
      where: {
        dataNascimento: { not: null },
        telefone: { not: null },
        tenant: { ativo: true },
      },
      include: { tenant: true },
    });

    const aniversariantesHoje = candidatos.filter((c) => {
      if (!c.dataNascimento) return false;
      const nasc = new Date(c.dataNascimento);
      return (
        nasc.getUTCMonth() === hoje.getMonth() &&
        nasc.getUTCDate() === hoje.getDate() &&
        c.ultimoAnoAniversarioEnviado !== hoje.getFullYear()
      );
    });

    for (const cliente of aniversariantesHoje) {
      const resultado = await this.whatsapp.enviarTemplate({
        tenantId: cliente.tenantId,
        tipo: 'ANIVERSARIO',
        telefoneDestino: cliente.telefone!,
        variaveis: { nomeCliente: cliente.nome, nomeNegocio: cliente.tenant.nomeNegocio },
        clienteId: cliente.id,
      });
      if (resultado.enviado) {
        await this.prisma.cliente.update({
          where: { id: cliente.id },
          data: { ultimoAnoAniversarioEnviado: hoje.getFullYear() },
        });
      }
    }
    this.logger.log(`Aniversários: ${aniversariantesHoje.length} candidato(s), processado(s).`);
  }

  private async processarLembrete(
    campoEnviado: 'lembreteVesperaEnviadoEm' | 'lembreteDiaDaEnviadoEm',
    tipo: 'VESPERA' | 'DIA_DA',
    { inicio, fim }: { inicio: Date; fim: Date },
  ) {
    const candidatos = await this.prisma.agendamento.findMany({
      where: {
        status: 'agendado',
        [campoEnviado]: null,
        telefoneCliente: { not: null },
        horario: { data: { gte: inicio, lte: fim } },
        tenant: { ativo: true },
      },
      include: { horario: true, tenant: true, cliente: true },
    });

    for (const agendamento of candidatos) {
      const resultado = await this.whatsapp.enviarTemplate({
        tenantId: agendamento.tenantId,
        tipo,
        telefoneDestino: agendamento.telefoneCliente!,
        variaveis: {
          nomeCliente: agendamento.cliente?.nome || agendamento.nomeCliente || 'cliente',
          nomeNegocio: agendamento.tenant.nomeNegocio,
          data: formatarDataPtBr(agendamento.horario.data),
          hora: agendamento.horario.horaInicio,
          servico: agendamento.servico,
        },
        clienteId: agendamento.clienteId ?? undefined,
        agendamentoId: agendamento.id,
      });

      if (resultado.enviado) {
        await this.prisma.agendamento.update({
          where: { id: agendamento.id },
          data: { [campoEnviado]: new Date() },
        });
      }
    }
    this.logger.log(`${tipo}: ${candidatos.length} candidato(s), processado(s).`);
  }
}

function formatarDataPtBr(data: Date): string {
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
