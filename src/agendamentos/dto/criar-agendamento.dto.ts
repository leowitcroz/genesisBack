import { IsNumber, IsString, IsOptional, IsArray, IsEnum, IsBoolean } from 'class-validator';
import { FormaPagamento } from '@prisma/client';

export class CriarAgendamentoDto {
  @IsNumber()
  @IsOptional()
  clienteId?: number;

  @IsString()
  @IsOptional()
  nomeClienteAvulso?: string;

  @IsString()
  @IsOptional()
  telefoneClienteAvulso?: string;

  @IsNumber()
  funcionarioId: number;

  @IsNumber()
  horarioId: number;

  @IsArray()
  @IsNumber({}, { each: true })
  servicoIds: number[];

  @IsEnum(FormaPagamento)
  formaPagamento: FormaPagamento;

  @IsBoolean()
  @IsOptional()
  cupomAplicado?: boolean;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsString()
  @IsOptional()
  notaCliente?: string;
}