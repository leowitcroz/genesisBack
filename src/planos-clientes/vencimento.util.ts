// Dia de vencimento livre (1-31) — em meses mais curtos que o dia escolhido
// (ex: 31 em abril, 30 dias), ajusta pro último dia válido do mês. Mesmo
// truque já usado em DespesaRecorrente.dayOfMonth (propagarDespesasRecorrentes).
function ultimoDiaDoMes(ano: number, mesIndex0: number): number {
  return new Date(ano, mesIndex0 + 1, 0).getDate();
}

export function diaVencimentoAjustado(diaVencimento: number, ano: number, mesIndex0: number): number {
  return Math.min(diaVencimento, ultimoDiaDoMes(ano, mesIndex0));
}

export function proximaDataVencimento(diaVencimento: number, aPartirDe: Date): Date {
  const data = new Date(aPartirDe);
  const diaAjustadoMesAtual = diaVencimentoAjustado(diaVencimento, data.getFullYear(), data.getMonth());

  if (data.getDate() <= diaAjustadoMesAtual) {
    data.setDate(diaAjustadoMesAtual);
  } else {
    data.setDate(1); // evita "pular" mês por causa de dia inexistente (ex: 31 -> 3 de abril)
    data.setMonth(data.getMonth() + 1);
    data.setDate(diaVencimentoAjustado(diaVencimento, data.getFullYear(), data.getMonth()));
  }
  data.setHours(0, 0, 0, 0);
  return data;
}
