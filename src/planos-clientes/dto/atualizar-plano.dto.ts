import { IsString, IsNumber, IsInt, IsArray, IsBoolean, Min, IsOptional } from 'class-validator';

export class AtualizarPlanoDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorMensal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  qtdCreditos?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  // Quando enviado, substitui a lista inteira de serviços cobertos (set, não merge).
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  servicoIds?: number[];
}
