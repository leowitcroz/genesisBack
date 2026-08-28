import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ConectarWhatsappDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  wabaId: string;

  @IsString()
  @IsNotEmpty()
  phoneNumberId: string;

  @IsString()
  @IsOptional()
  numeroExibicao?: string;
}
