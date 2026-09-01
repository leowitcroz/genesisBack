import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CriarClienteRapidoDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  telefone?: string;
}
