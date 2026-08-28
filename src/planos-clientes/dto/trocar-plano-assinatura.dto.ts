import { IsInt, Min, Max, IsOptional } from 'class-validator';

export class TrocarPlanoAssinaturaDto {
  @IsOptional()
  @IsInt()
  planoId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento?: number;
}
