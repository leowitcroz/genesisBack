import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AdmService } from './adm.service';
import {  } from '../auth/jwt-auth.guard';
import { PlanoSaaS } from '@prisma/client';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // Descomente e ajuste o caminho do seu Guard

@Controller('adm')
// @UseGuards(JwtAuthGuard) // 🔒 PROTEJA ESTA ROTA PARA NÃO VAZAR DADOS GLOBAIS
export class AdmController {
  constructor(private readonly admService: AdmService) {}

  @Get('tenants')
  async getTenants() {
    return this.admService.getAllTenants();
  }

  @Get('funcionarios')
  async getFuncionarios() {
    return this.admService.getAllFuncionarios();
  }

  @Get('clientes')
  async getClientes() {
    return this.admService.getAllClientes();
  }

  @Patch('tenants/:id/plano')
  async atualizarPlano(
    @Param('id') id: string, 
    // 👇 2. Troque 'string' por 'PlanoSaaS' aqui
    @Body() body: { planoSaaS: PlanoSaaS; moduloAgendamento: boolean; moduloFinanceiro: boolean; moduloProdutos: boolean; moduloVendas: boolean }
  ) {
    return this.admService.atualizarPlanoLoja(id, body);
  }

  @Patch('tenants/:id/status')
  async alterarStatus(
    @Param('id') id: string, 
    @Body('ativo') ativo: boolean
  ) {
    return this.admService.alterarStatusLoja(id, ativo);
  }

}