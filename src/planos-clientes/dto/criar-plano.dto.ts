import { IsString, IsNumber, IsInt, IsArray, Min } from 'class-validator';

export class CriarPlanoDto {
  @IsString()
  nome: string;

  @IsNumber()
  @Min(0)
  valorMensal: number;

  @IsInt()
  @Min(0)
  qtdCreditos: number;

  // Serviços cobertos por esse pacote (ex: "Aula de Dança") — sem isso o
  // agendamento nunca reconhece o pacote e os créditos nunca são consumidos
  // (ver agendamentos.service.ts, checagem de servico.planosInclusos).
  @IsArray()
  @IsInt({ each: true })
  servicoIds: number[];
}
