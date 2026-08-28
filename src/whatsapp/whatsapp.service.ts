import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { GRAPH_API_BASE, NOME_TEMPLATE_META } from './whatsapp.constants';
import { WhatsappTemplateTipo } from '@prisma/client';

interface ResultadoEnvio {
  enviado: boolean;
  simulado: boolean;
  erro?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: WhatsappTemplatesService,
  ) {}

  // =========================================================
  // CRIPTOGRAFIA DO TOKEN (é uma credencial viva, capaz de mandar
  // mensagem em nome do WhatsApp Business real do cliente — nunca
  // fica em texto puro no banco)
  // =========================================================

  private obterChaveCriptografia(): Buffer {
    const chave = process.env.WHATSAPP_TOKEN_ENC_KEY || '';
    // Deriva 32 bytes estáveis a partir da chave configurada, qualquer que
    // seja o tamanho dela — evita quebrar se a env var não tiver exatamente
    // 32 bytes.
    return crypto.createHash('sha256').update(chave).digest();
  }

  private criptografarToken(token: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.obterChaveCriptografia(), iv);
    const criptografado = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${criptografado.toString('hex')}`;
  }

  private descriptografarToken(valor: string): string {
    const [ivHex, dadosHex] = valor.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.obterChaveCriptografia(), Buffer.from(ivHex, 'hex'));
    const decriptografado = Buffer.concat([decipher.update(Buffer.from(dadosHex, 'hex')), decipher.final()]);
    return decriptografado.toString('utf8');
  }

  // =========================================================
  // ENVIO — caminho único usado pelo cron E pela confirmação na criação.
  // Tudo antes do branch simulado/real roda igual nos dois modos.
  // =========================================================

  async enviarTemplate(params: {
    tenantId: string;
    tipo: WhatsappTemplateTipo;
    telefoneDestino: string;
    variaveis: Record<string, string>;
    clienteId?: number;
    agendamentoId?: number;
  }): Promise<ResultadoEnvio> {
    const { tenantId, tipo, telefoneDestino, variaveis, clienteId, agendamentoId } = params;

    if (!telefoneDestino) {
      return { enviado: false, simulado: true, erro: 'Sem telefone de destino.' };
    }

    const tenantWhatsapp = await this.prisma.tenantWhatsapp.findUnique({ where: { tenantId } });
    const simulado = tenantWhatsapp?.modoSimulado ?? (process.env.WHATSAPP_MODO_SIMULADO !== 'false');
    const textoRenderizado = this.templates.renderizar(tipo, variaveis);

    if (simulado) {
      this.logger.log(`[SIMULADO] ${tipo} -> ${telefoneDestino}: ${textoRenderizado}`);
      await this.prisma.whatsappEnvioLog.create({
        data: {
          tenantId, tipo, destinatario: telefoneDestino, clienteId, agendamentoId,
          simulado: true, sucesso: true,
          payloadRenderizado: { texto: textoRenderizado, variaveis },
        },
      });
      return { enviado: true, simulado: true };
    }

    if (!tenantWhatsapp || tenantWhatsapp.status !== 'CONECTADO' || !tenantWhatsapp.phoneNumberId || !tenantWhatsapp.accessTokenCriptografado) {
      const erro = 'WhatsApp não está conectado para este estabelecimento.';
      await this.prisma.whatsappEnvioLog.create({
        data: { tenantId, tipo, destinatario: telefoneDestino, clienteId, agendamentoId, simulado: false, sucesso: false, erro },
      });
      return { enviado: false, simulado: false, erro };
    }

    try {
      const resposta = await this.enviarMensagemGraphApi(tenantWhatsapp, tipo, telefoneDestino, variaveis);
      await this.prisma.whatsappEnvioLog.create({
        data: {
          tenantId, tipo, destinatario: telefoneDestino, clienteId, agendamentoId,
          simulado: false, sucesso: true,
          payloadRenderizado: { texto: textoRenderizado, resposta },
        },
      });
      return { enviado: true, simulado: false };
    } catch (erro: any) {
      const mensagemErro = erro?.message || String(erro);
      this.logger.error(`Falha ao enviar WhatsApp real (${tipo}) pro tenant ${tenantId}`, erro);
      await this.prisma.whatsappEnvioLog.create({
        data: { tenantId, tipo, destinatario: telefoneDestino, clienteId, agendamentoId, simulado: false, sucesso: false, erro: mensagemErro },
      });
      return { enviado: false, simulado: false, erro: mensagemErro };
    }
  }

  // Envio real via Cloud API — formato estável e bem documentado da Meta
  // (POST /{phone-number-id}/messages, mensagem tipo "template" com
  // parâmetros posicionais). Só é alcançado quando status já é CONECTADO.
  private async enviarMensagemGraphApi(
    tenantWhatsapp: { phoneNumberId: string | null; accessTokenCriptografado: string | null },
    tipo: WhatsappTemplateTipo,
    telefoneDestino: string,
    variaveis: Record<string, string>,
  ) {
    const token = this.descriptografarToken(tenantWhatsapp.accessTokenCriptografado!);
    const { ordemVariaveis } = this.templates.obterDefinicao(tipo);
    const parametros = ordemVariaveis.map((chave) => ({ type: 'text', text: variaveis[chave] ?? '' }));

    const resposta = await fetch(`${GRAPH_API_BASE}/${tenantWhatsapp.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefoneDestino.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: NOME_TEMPLATE_META[tipo],
          language: { code: 'pt_BR' },
          components: [{ type: 'body', parameters: parametros }],
        },
      }),
    });

    const corpo = await resposta.json();
    if (!resposta.ok) {
      throw new Error(corpo?.error?.message || `Graph API respondeu ${resposta.status}`);
    }
    return corpo;
  }

  // =========================================================
  // CONEXÃO (Embedded Signup) — bloqueado até o App da Meta existir
  // (META_APP_ID/META_APP_SECRET). Ver checklist externo no plano.
  // =========================================================

  async processarCallbackEmbeddedSignup(
    tenantId: string,
    dados: { code: string; wabaId: string; phoneNumberId: string; numeroExibicao?: string },
  ) {
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      throw new NotFoundException(
        'Integração com a Meta ainda não configurada neste ambiente (META_APP_ID/META_APP_SECRET pendentes).',
      );
    }

    // Troca de código por token — endpoint OAuth padrão da Meta. Para uso
    // como Tech Provider (token de longa duração vinculado ao WABA do
    // cliente, não ao usuário que fez o clique), pode ser necessário um passo
    // extra de atribuição de System User — confirmar contra a documentação
    // vigente da Meta no momento de testar com um App real.
    const url = `${GRAPH_API_BASE}/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&code=${dados.code}`;
    const resposta = await fetch(url);
    const corpo = await resposta.json();
    if (!resposta.ok) {
      throw new Error(corpo?.error?.message || 'Falha ao trocar o código do Embedded Signup por um token.');
    }

    const tenantWhatsapp = await this.prisma.tenantWhatsapp.upsert({
      where: { tenantId },
      create: {
        tenantId,
        status: 'CONECTADO',
        wabaId: dados.wabaId,
        phoneNumberId: dados.phoneNumberId,
        numeroExibicao: dados.numeroExibicao,
        accessTokenCriptografado: this.criptografarToken(corpo.access_token),
        conectadoEm: new Date(),
      },
      update: {
        status: 'CONECTADO',
        wabaId: dados.wabaId,
        phoneNumberId: dados.phoneNumberId,
        numeroExibicao: dados.numeroExibicao,
        accessTokenCriptografado: this.criptografarToken(corpo.access_token),
        conectadoEm: new Date(),
        ultimoErro: null,
      },
    });

    await this.submeterTemplatesIniciais(tenantId);
    return tenantWhatsapp;
  }

  async desconectar(tenantId: string) {
    await this.prisma.tenantWhatsapp.updateMany({
      where: { tenantId },
      data: { status: 'DESCONECTADO', accessTokenCriptografado: null, wabaId: null, phoneNumberId: null },
    });
  }

  // =========================================================
  // TEMPLATES
  // =========================================================

  // Submete os 4 templates fixos pra aprovação da Meta. Idempotente — pula
  // qualquer tipo que já esteja PENDENTE/APROVADO.
  async submeterTemplatesIniciais(tenantId: string) {
    const tenantWhatsapp = await this.prisma.tenantWhatsapp.findUnique({
      where: { tenantId },
      include: { templates: true },
    });
    if (!tenantWhatsapp?.wabaId || !tenantWhatsapp.accessTokenCriptografado) return [];

    const token = this.descriptografarToken(tenantWhatsapp.accessTokenCriptografado);
    const jaEnviados = new Set(
      tenantWhatsapp.templates.filter((t) => t.status === 'PENDENTE' || t.status === 'APROVADO').map((t) => t.tipo),
    );

    const resultados = [];
    for (const tipo of Object.values(WhatsappTemplateTipo)) {
      if (jaEnviados.has(tipo)) continue;

      const { corpo } = this.templates.obterDefinicao(tipo);
      // Corpo com placeholders posicionais {{1}}, {{2}}... exigidos pela Meta
      const corpoPosicional = this.templates.obterDefinicao(tipo).ordemVariaveis.reduce(
        (texto, nomeVar, indice) => texto.split(`{{${nomeVar}}}`).join(`{{${indice + 1}}}`),
        corpo,
      );

      let status: 'PENDENTE' | 'REJEITADO' = 'PENDENTE';
      let motivoRejeicao: string | undefined;
      try {
        const resposta = await fetch(`${GRAPH_API_BASE}/${tenantWhatsapp.wabaId}/message_templates`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: NOME_TEMPLATE_META[tipo],
            language: 'pt_BR',
            category: 'UTILITY',
            components: [{ type: 'BODY', text: corpoPosicional }],
          }),
        });
        const corpoResposta = await resposta.json();
        if (!resposta.ok) {
          status = 'REJEITADO';
          motivoRejeicao = corpoResposta?.error?.message || `Graph API respondeu ${resposta.status}`;
        }
      } catch (erro: any) {
        status = 'REJEITADO';
        motivoRejeicao = erro?.message || String(erro);
      }

      const registro = await this.prisma.tenantWhatsappTemplate.upsert({
        where: { tenantWhatsappId_tipo: { tenantWhatsappId: tenantWhatsapp.id, tipo } },
        create: { tenantWhatsappId: tenantWhatsapp.id, tipo, nomeMeta: NOME_TEMPLATE_META[tipo], status, motivoRejeicao },
        update: { status, motivoRejeicao },
      });
      resultados.push(registro);
    }
    return resultados;
  }

  // Consulta on-demand do status de aprovação — chamado pelo botão "Atualizar
  // status" na tela. Uma versão futura poderia trocar isso por um webhook da
  // Meta; polling é a escolha mais simples pra esta entrega.
  async atualizarStatusTemplates(tenantId: string) {
    const tenantWhatsapp = await this.prisma.tenantWhatsapp.findUnique({
      where: { tenantId },
      include: { templates: true },
    });
    if (!tenantWhatsapp?.wabaId || !tenantWhatsapp.accessTokenCriptografado) return [];

    const token = this.descriptografarToken(tenantWhatsapp.accessTokenCriptografado);
    const resposta = await fetch(
      `${GRAPH_API_BASE}/${tenantWhatsapp.wabaId}/message_templates?fields=name,status,rejected_reason`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const corpo = await resposta.json();
    if (!resposta.ok) throw new Error(corpo?.error?.message || 'Falha ao consultar status dos templates.');

    const porNome = new Map<string, any>((corpo.data || []).map((t: any) => [t.name, t]));
    const atualizados = [];
    for (const registro of tenantWhatsapp.templates) {
      const remoto = porNome.get(registro.nomeMeta);
      if (!remoto) continue;
      const status = remoto.status === 'APPROVED' ? 'APROVADO' : remoto.status === 'REJECTED' ? 'REJEITADO' : 'PENDENTE';
      atualizados.push(
        await this.prisma.tenantWhatsappTemplate.update({
          where: { id: registro.id },
          data: {
            status,
            motivoRejeicao: remoto.rejected_reason || null,
            aprovadoEm: status === 'APROVADO' ? new Date() : registro.aprovadoEm,
          },
        }),
      );
    }
    return atualizados;
  }

  // =========================================================
  // CONSULTAS (usadas pela tela de configuração)
  // =========================================================

  async obterConexao(tenantId: string) {
    const conexao = await this.prisma.tenantWhatsapp.findUnique({
      where: { tenantId },
      include: { templates: true },
    });
    if (!conexao) {
      return { status: 'DESCONECTADO' as const, modoSimulado: true, templates: [] };
    }
    // Nunca devolve o token pro front, nem criptografado.
    const { accessTokenCriptografado, ...semToken } = conexao;
    return semToken;
  }

  async atualizarModoSimulado(tenantId: string, modoSimulado: boolean) {
    return this.prisma.tenantWhatsapp.upsert({
      where: { tenantId },
      create: { tenantId, modoSimulado },
      update: { modoSimulado },
    });
  }

  async obterLogs(tenantId: string, limite = 20) {
    return this.prisma.whatsappEnvioLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limite,
    });
  }
}
