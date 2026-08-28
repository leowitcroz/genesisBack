import { WhatsappTemplateTipo } from '@prisma/client';

export const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Nome exato registrado na Meta pra cada template — precisa bater com o que
// for de fato submetido em submeterTemplatesIniciais().
export const NOME_TEMPLATE_META: Record<WhatsappTemplateTipo, string> = {
  CONFIRMACAO: 'confirmacao_agendamento_v1',
  VESPERA: 'lembrete_vespera_v1',
  DIA_DA: 'lembrete_dia_v1',
  ANIVERSARIO: 'feliz_aniversario_v1',
};
