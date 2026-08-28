import { Injectable } from '@nestjs/common';
import { WhatsappTemplateTipo } from '@prisma/client';

// Corpo de cada template com placeholders nomeados ({{variavel}}) — usado pra
// renderizar o texto tanto no modo simulado (o que aparece em "Atividade
// recente") quanto como preview antes de enviar de verdade.
//
// Quando a Meta aprova um template, ela só aceita variáveis POSICIONAIS
// ({{1}}, {{2}}...) no corpo — por isso cada entrada aqui também guarda
// `ordemVariaveis`, o mapeamento de qual variável nomeada vira qual posição
// na hora de montar a chamada real da Graph API (isso só é usado no caminho
// de envio de verdade, ainda não implementado enquanto não existe o App da
// Meta — ver whatsapp.service.ts).
interface DefinicaoTemplate {
  corpo: string;
  ordemVariaveis: string[];
}

const TEMPLATES: Record<WhatsappTemplateTipo, DefinicaoTemplate> = {
  CONFIRMACAO: {
    corpo:
      'Olá {{nomeCliente}}! Seu agendamento em *{{nomeNegocio}}* foi confirmado ' +
      'para {{data}} às {{hora}} ({{servico}}).{{notaClienteFormatada}}',
    ordemVariaveis: ['nomeCliente', 'nomeNegocio', 'data', 'hora', 'servico', 'notaClienteFormatada'],
  },
  VESPERA: {
    corpo:
      'Olá {{nomeCliente}}! Passando pra lembrar que amanhã, {{data}} às {{hora}}, ' +
      'você tem *{{servico}}* agendado em {{nomeNegocio}}. Te esperamos!',
    ordemVariaveis: ['nomeCliente', 'data', 'hora', 'servico', 'nomeNegocio'],
  },
  DIA_DA: {
    corpo:
      'Bom dia, {{nomeCliente}}! Hoje às {{hora}} você tem *{{servico}}* agendado ' +
      'em {{nomeNegocio}}. Até já!',
    ordemVariaveis: ['nomeCliente', 'hora', 'servico', 'nomeNegocio'],
  },
  ANIVERSARIO: {
    corpo: 'Feliz aniversário, {{nomeCliente}}! 🎉 A equipe {{nomeNegocio}} deseja um dia incrível pra você!',
    ordemVariaveis: ['nomeCliente', 'nomeNegocio'],
  },
};

@Injectable()
export class WhatsappTemplatesService {
  obterDefinicao(tipo: WhatsappTemplateTipo): DefinicaoTemplate {
    return TEMPLATES[tipo];
  }

  // Substitui {{chave}} pelos valores recebidos. Variável ausente vira string
  // vazia (nunca deixa "{{x}}" literal escapar pro texto final).
  renderizar(tipo: WhatsappTemplateTipo, variaveis: Record<string, string>): string {
    const { corpo } = TEMPLATES[tipo];
    return corpo.replace(/\{\{(\w+)\}\}/g, (_match, chave) => variaveis[chave] ?? '');
  }
}
