import { IsInt, Min, Max } from 'class-validator';

export class CriarAssinaturaDto {
  @IsInt()
  clienteId: number;

  @IsInt()
  planoId: number;

  // Qualquer dia de 1 a 31 — em meses mais curtos, o cron ajusta pro
  // último dia válido (mesmo comportamento do dayOfMonth de DespesaRecorrente).
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento: number;
}
