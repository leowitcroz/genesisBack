import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormaPagamento } from '@prisma/client';

@Injectable()
export class AgendamentosService {
  constructor(private readonly prisma: PrismaService) { }

  // =========================================================================
  // 1. CRIAR AGENDAMENTO (Totalmente Genérico e Multi-Tenant)
  // =========================================================================
  async criar(tenantId: string, data: {
    clienteId?: number;
    nomeClienteAvulso?: string;
    funcionarioId: number;
    horarioId: number;
    servicoIds: number[];
    formaPagamento: FormaPagamento;
    cupomAplicado?: boolean;
  }) {
    return await this.prisma.$transaction(async (tx) => {

      // 1. Validação e Bloqueio Atômico de Horário (Resolve a Race Condition)
      // O updateMany garante que ele SÓ vai atualizar se o disponivel ainda for true.
      const atualizouHorario = await tx.disponibilidade.updateMany({
        where: {
          id: data.horarioId,
          funcionarioId: data.funcionarioId,
          tenantId,
          disponivel: true // Condição crucial
        },
        data: { disponivel: false }
      });

      // Se a contagem for 0, significa que o horário não existe, é de outro tenant, 
      // ou alguém agendou na mesma fração de segundo.
      if (atualizouHorario.count === 0) {
        throw new ConflictException('Horário indisponível, não encontrado ou acabou de ser reservado por outro cliente.');
      }

      // 2. Busca Serviços e Assinatura
      const servicos = await tx.servico.findMany({
        where: { id: { in: data.servicoIds }, tenantId },
        include: { planosInclusos: true }
      });

      let assinaturaAtiva = null;
      let nomeDoCliente = data.nomeClienteAvulso || "Cliente Avulso";

      if (data.clienteId) {
        const cliente = await tx.cliente.findUnique({ where: { id: data.clienteId, tenantId } });
        if (cliente) {
          nomeDoCliente = cliente.nome;
          assinaturaAtiva = await tx.assinaturaCliente.findFirst({
            where: { clienteId: cliente.id, tenantId, ativo: true, status: 'Ativo' },
            include: { plano: true }
          });
        }
      }

      // 3. SEPARAÇÃO E ORDENAÇÃO (Maior valor primeiro)
      const servicosCobertosPeloPlano = [];
      const servicosNaoCobertos = [];
      let valorTotalOriginal = 0;

      for (const s of servicos) {
        valorTotalOriginal += s.valor;
        const coberto = assinaturaAtiva && s.planosInclusos.some(p => p.id === assinaturaAtiva.planoId);
        if (coberto) {
          servicosCobertosPeloPlano.push(s);
        } else {
          servicosNaoCobertos.push(s);
        }
      }

      // Ordena os que o plano cobre do mais caro para o mais barato
      servicosCobertosPeloPlano.sort((a, b) => b.valor - a.valor);

      let valorFinalCobrado = 0;
      let totalCreditosGastos = 0;
      let saldoDisponivel = assinaturaAtiva ? (assinaturaAtiva.limiteCreditos - assinaturaAtiva.creditosUsados) : 0;

      // Processa os serviços cobertos usando o saldo disponível
      for (const s of servicosCobertosPeloPlano) {
        if (saldoDisponivel > 0) {
          saldoDisponivel -= 1;
          totalCreditosGastos += 1;
        } else {
          valorFinalCobrado += s.valor;
        }
      }

      // Soma os serviços que o plano não cobre de jeito nenhum
      for (const s of servicosNaoCobertos) {
        valorFinalCobrado += s.valor;
      }

      if (data.cupomAplicado && valorFinalCobrado > 0) valorFinalCobrado *= 0.90;

      const tipoAgendamento = valorFinalCobrado === 0 && totalCreditosGastos > 0 ? 'PLANO_TOTAL' :
        totalCreditosGastos > 0 ? 'PARCIAL' : 'AVULSO';

      // 4. Persistência
      const agendamento = await tx.agendamento.create({
        data: {
          tenantId,
          clienteId: data.clienteId || null,
          nomeCliente: nomeDoCliente,
          funcionarioId: data.funcionarioId,
          horarioId: data.horarioId,
          servico: servicos.map(s => s.nome).join(' + '),
          valorServico: valorTotalOriginal,
          valor: valorFinalCobrado,
          creditosGastos: totalCreditosGastos,
          tipo: tipoAgendamento,
          formaPagamento: data.formaPagamento,
          cupom: data.cupomAplicado || false,
          status: 'agendado'
        }
      });

      // OBS: Retiramos o update do horário daqui do final, pois já o bloqueamos no passo 1!

      if (totalCreditosGastos > 0 && assinaturaAtiva) {
        await tx.assinaturaCliente.update({
          where: { id: assinaturaAtiva.id },
          data: { creditosUsados: { increment: totalCreditosGastos } }
        });
      }

      return agendamento;
    });
  }

  // =========================================================================
  // 2. CANCELAR AGENDAMENTO (Devolve horário e estorna créditos)
  // =========================================================================
  async cancelar(tenantId: string, agendamentoId: number, clienteId?: number) {

    return await this.prisma.$transaction(async (tx) => {
      const agendamento = await tx.agendamento.findFirst({
        where: { id: agendamentoId, tenantId },
        include: { horario: true, cliente: { include: { assinatura: true } } }
      });

      if (!agendamento) throw new NotFoundException('Agendamento não encontrado.');

      if (clienteId && agendamento.clienteId !== clienteId) {
        throw new ForbiddenException('Você não tem permissão para cancelar este agendamento.');
      }

      if (agendamento.status === 'cancelado') throw new BadRequestException('Já cancelado.');

      // 1. Atualiza Status e libera horário
      const agendamentoCancelado = await tx.agendamento.update({
        where: { id: agendamentoId },
        data: { status: 'cancelado' }
      });

      await tx.disponibilidade.update({
        where: { id: agendamento.horarioId },
        data: { disponivel: true }
      });

      // 2. Estorno Cirúrgico (Usa o valor exato gravado no agendamento)
      if (agendamento.creditosGastos > 0 && agendamento.cliente?.assinatura) {
        await tx.assinaturaCliente.update({
          where: { id: agendamento.cliente.assinatura.id },
          data: { creditosUsados: { decrement: agendamento.creditosGastos } }
        });
      }

      return agendamentoCancelado;
    });
  }

  // =========================================================================
  // 3. LISTAR AGENDAMENTOS DO NEGÓCIO
  // =========================================================================
  async listarTodos(tenantId: string, filtros?: { inicio?: string; fim?: string; status?: string }) {
    const whereClause: any = { tenantId };

    if (filtros?.status) {
      whereClause.status = filtros.status;
    }

    if (filtros?.inicio || filtros?.fim) {
      whereClause.horario = { data: {} };

      if (filtros.inicio) {
        // Força o fuso do Brasil para começar 00:00:00 do dia selecionado
        whereClause.horario.data.gte = new Date(filtros.inicio + 'T00:00:00-03:00');
      }

      if (filtros.fim) {
        // Força o fuso do Brasil para terminar 23:59:59 do dia selecionado
        whereClause.horario.data.lte = new Date(filtros.fim + 'T23:59:59-03:00');
      }
    }

    return await this.prisma.agendamento.findMany({
      where: whereClause,
      include: {
        cliente: { select: { nome: true, telefone: true } },
        funcionario: { select: { nome: true } },
        horario: { select: { data: true, horaInicio: true, horaFim: true } }
      },
      orderBy: [
        { horario: { data: 'asc' } },
        { horario: { horaInicio: 'asc' } }
      ]
    });
  }

  // =========================================================================
  //3. EDITA O AGENDAMENTO
  // =========================================================================

  async editar(tenantId: string, agendamentoId: number, data: Partial<{
    clienteId: number;
    funcionarioId: number;
    horarioId: number;
    servicoIds: number[];
    formaPagamento: FormaPagamento;
    cupomAplicado: boolean;
    status?: string;
  }>) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. BUSCA O ESTADO ATUAL (Essencial para o estorno)
      const agendamentoAtual = await tx.agendamento.findFirst({
        where: { id: agendamentoId, tenantId },
        include: {
          horario: true,
          cliente: {
            include: { assinatura: true }
          }
        }
      });

      if (!agendamentoAtual) throw new NotFoundException('Agendamento não encontrado');

      // --- VALIDAÇÃO DE SEGURANÇA MULTI-TENANT (Prevenção de Injeção de IDs) ---
      if (data.clienteId && data.clienteId !== agendamentoAtual.clienteId) {
        const clientePertenceAoTenant = await tx.cliente.findFirst({
          where: { id: data.clienteId, tenantId }
        });
        if (!clientePertenceAoTenant) throw new ForbiddenException('Cliente inválido ou não pertence a esta empresa.');
      }

      if (data.funcionarioId && data.funcionarioId !== agendamentoAtual.funcionarioId) {
        const funcionarioPertenceAoTenant = await tx.funcionario.findFirst({
          where: { id: data.funcionarioId, tenantId }
        });
        if (!funcionarioPertenceAoTenant) throw new ForbiddenException('Funcionário inválido ou não pertence a esta empresa.');
      }

      // --- DEFINIÇÃO DE VARIÁVEIS EFETIVAS (Fallback para dados antigos) ---
      const funcionarioIdEfetivo = data.funcionarioId ?? agendamentoAtual.funcionarioId;
      const horarioIdEfetivo = data.horarioId ?? agendamentoAtual.horarioId;
      const clienteIdEfetivo = data.clienteId ?? agendamentoAtual.clienteId;
      const formaPagamentoEfetiva = data.formaPagamento ?? agendamentoAtual.formaPagamento;
      const cupomEfetivo = data.cupomAplicado ?? agendamentoAtual.cupom;

      if (data.status && Object.keys(data).length === 1) {
        return await this.prisma.agendamento.updateMany({
          where: { id: agendamentoId, tenantId },
          data: { status: data.status }
        });
      }

      // 2. ESTORNO E TROCA DE HORÁRIO COM TRAVA ATÔMICA

      // Se o horário for mudar, precisamos liberar o antigo e travar o novo com segurança
      if (agendamentoAtual.horarioId !== horarioIdEfetivo) {
        // Trava o NOVO horário primeiro (se falhar, aborta tudo sem mexer no banco)
        const atualizouNovoHorario = await tx.disponibilidade.updateMany({
          where: { id: horarioIdEfetivo, tenantId, disponivel: true },
          data: { disponivel: false }
        });

        if (atualizouNovoHorario.count === 0) {
          throw new ConflictException('O novo horário selecionado não está disponível ou acabou de ser reservado.');
        }

        // Libera o horário ANTIGO
        await tx.disponibilidade.update({
          where: { id: agendamentoAtual.horarioId },
          data: { disponivel: true }
        });
      }

      // B. Devolve EXATAMENTE os créditos que foram gastos no passado
      if (agendamentoAtual.creditosGastos > 0 && agendamentoAtual.cliente?.assinatura) {
        await tx.assinaturaCliente.update({
          where: { id: agendamentoAtual.cliente.assinatura.id },
          data: { creditosUsados: { decrement: agendamentoAtual.creditosGastos } }
        });
      }

      // 4. BUSCA NOVOS SERVIÇOS E CONFIGURAÇÕES DE PLANO
      const novosServicos = await tx.servico.findMany({
        where: { id: { in: data.servicoIds }, tenantId },
        include: { planosInclusos: true }
      });

      // 5. LÓGICA DE PRECIFICAÇÃO INTELIGENTE (Prioridade para o maior valor)
      let assinaturaAtiva = null;
      if (clienteIdEfetivo) {
        assinaturaAtiva = await tx.assinaturaCliente.findFirst({
          where: { clienteId: clienteIdEfetivo, tenantId, ativo: true, status: 'Ativo' },
          include: { plano: true }
        });
      }

      const servicosCobertosPeloPlano = [];
      const servicosNaoCobertos = [];
      let valorTotalOriginal = 0;

      for (const s of novosServicos) {
        valorTotalOriginal += s.valor;
        const coberto = assinaturaAtiva && s.planosInclusos.some(p => p.id === assinaturaAtiva.planoId);

        if (coberto) {
          servicosCobertosPeloPlano.push(s);
        } else {
          servicosNaoCobertos.push(s);
        }
      }

      // ORDENAÇÃO: Mais caros primeiro
      servicosCobertosPeloPlano.sort((a, b) => b.valor - a.valor);

      let valorFinalCobrado = 0;
      let novosCreditosGastos = 0;
      let saldoRestante = assinaturaAtiva ? (assinaturaAtiva.limiteCreditos - assinaturaAtiva.creditosUsados) : 0;

      for (const s of servicosCobertosPeloPlano) {
        if (saldoRestante > 0) {
          saldoRestante -= 1;
          novosCreditosGastos += 1;
        } else {
          valorFinalCobrado += s.valor;
        }
      }

      for (const s of servicosNaoCobertos) {
        valorFinalCobrado += s.valor;
      }

      if (cupomEfetivo && valorFinalCobrado > 0) valorFinalCobrado *= 0.90;

      const novoTipo = valorFinalCobrado === 0 && novosCreditosGastos > 0 ? 'PLANO_TOTAL' :
        novosCreditosGastos > 0 ? 'PARCIAL' : 'AVULSO';

      // 6. ATUALIZAÇÃO NO BANCO
      const agendamentoAtualizado = await tx.agendamento.update({
        where: { id: agendamentoId },
        data: {
          clienteId: clienteIdEfetivo,
          funcionarioId: funcionarioIdEfetivo,
          horarioId: horarioIdEfetivo,
          servico: novosServicos.map(s => s.nome).join(' + '),
          valorServico: valorTotalOriginal,
          valor: valorFinalCobrado,
          creditosGastos: novosCreditosGastos,
          tipo: novoTipo,
          formaPagamento: formaPagamentoEfetiva,
          cupom: cupomEfetivo,
          status: 'agendado'
        }
      });

      // C. Debita os novos créditos consumidos
      if (novosCreditosGastos > 0 && assinaturaAtiva) {
        await tx.assinaturaCliente.update({
          where: { id: assinaturaAtiva.id },
          data: { creditosUsados: { increment: novosCreditosGastos } }
        });
      }

      return agendamentoAtualizado;
    });
  }

  async criarAgendaEmMassa(
    tenantId: string, // <-- Injetado pelo Controller através do @TenantId()
    agendas: Array<{
      funcionarioId: number;
      horarios: Array<{ data: string | Date; horas: string[] }>;
    }>
  ) {
    const horariosParaCriar = [];
    const horariosIgnorados = [];
    const horariosInvalidos = [];
    const funcionariosNaoEncontrados = [];

    // 1. Loop pelos Funcionários
    for (const agenda of agendas) {
      const { funcionarioId, horarios } = agenda;

      // Verifica se o funcionário existe E se pertence a este Tenant
      const funcionarioExiste = await this.prisma.funcionario.findFirst({
        where: { id: funcionarioId, tenantId }
      });

      if (!funcionarioExiste) {
        funcionariosNaoEncontrados.push(funcionarioId);
        continue;
      }

      // 2. Loop pelas Datas
      for (const horarioDia of horarios) {
        const data = typeof horarioDia.data === 'string'
          ? new Date(horarioDia.data + 'T00:00:00-03:00')
          : horarioDia.data;

        // 3. Loop pelas Horas
        for (const hora of horarioDia.horas) {

          // Valida formato "HH:MM"
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(hora)) {
            horariosInvalidos.push(`Funcionário ${funcionarioId} - ${data.toISOString().split('T')[0]} ${hora}`);
            continue;
          }

          const horaFormatada = hora.padStart(5, '0');
          const [horaInicioH, minutoInicioM] = horaFormatada.split(':').map(Number);

          // --- LÓGICA DE IGNORAR REPETIDOS ---

          // 1. Verifica se já está na FILA DE MEMÓRIA (enviado duplicado no mesmo payload)
          const jaEstaNaFila = horariosParaCriar.some(h =>
            h.funcionarioId === funcionarioId &&
            h.data.getTime() === data.getTime() &&
            h.horaInicio === horaFormatada
          );

          if (jaEstaNaFila) {
            horariosIgnorados.push(`Ignorado (Duplicado no envio): Func. ${funcionarioId} às ${horaFormatada} em ${data.toISOString().split('T')[0]}`);
            continue;
          }

          // 2. Verifica se já existe no BANCO DE DADOS (isolado por tenant)
          const conflito = await this.prisma.disponibilidade.findFirst({
            where: {
              tenantId,
              funcionarioId,
              data: data,
              horaInicio: horaFormatada
            }
          });

          if (conflito) {
            horariosIgnorados.push(`Ignorado (Já existe no BD): Func. ${funcionarioId} às ${horaFormatada} em ${data.toISOString().split('T')[0]}`);
            continue;
          }

          // Se não existe na fila nem no banco, prepara para criar
          // Calcula hora fim (assumindo 1h de duração padrão, ajuste se precisar de durações variáveis)
          const horaFimH = horaInicioH + 1;
          const horaFimString = `${horaFimH.toString().padStart(2, '0')}:${minutoInicioM.toString().padStart(2, '0')}`;

          horariosParaCriar.push({
            tenantId,           // Garante a separação do SaaS
            funcionarioId,
            data,
            horaInicio: horaFormatada,
            horaFim: horaFimString,
            disponivel: true
          });
        }
      }
    }

    // --- TRATAMENTO DE ERROS CRÍTICOS ---

    if (funcionariosNaoEncontrados.length > 0) {
      throw new BadRequestException({
        message: `Funcionários IDs [${funcionariosNaoEncontrados.join(', ')}] não encontrados ou não pertencem ao seu negócio.`,
        error: 'Funcionário inválido'
      });
    }

    if (horariosInvalidos.length > 0) {
      throw new BadRequestException({
        message: 'Alguns horários têm formato inválido.',
        details: horariosInvalidos
      });
    }

    // Se não sobrou nenhum horário novo (tudo era repetido)
    if (horariosParaCriar.length === 0) {
      return {
        message: "Nenhum horário novo criado (todos já existiam).",
        totalCriado: 0,
        totalIgnorado: horariosIgnorados.length
      };
    }

    // --- SALVA NO BANCO OTIMIZADO ---
    // createMany é muito mais rápido e seguro para grandes volumes do que iterar fazendo .create()
    const resultado = await this.prisma.disponibilidade.createMany({
      data: horariosParaCriar,
      skipDuplicates: true // Camada extra de segurança do Prisma
    });

    return {
      message: 'Agenda processada com sucesso!',
      totalCriado: resultado.count, // createMany retorna um objeto com { count: number }
      totalIgnorado: horariosIgnorados.length
    };
  }


}

