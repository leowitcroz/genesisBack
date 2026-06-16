import { Controller, Post, Get, Body, Param, Query, Patch, ParseIntPipe } from '@nestjs/common';
import { AgendamentosService } from './agendamentos.service';
import { TenantId } from '../tenant/tenant.decorator'; 
import { CriarAgendamentoDto } from './dto/criar-agendamento.dto';
import { EditarAgendamentoDto } from './dto/editar-agendamento.dto';
import { CriarAgendaEmMassaDto } from './dto/criar-agenda-em-massa.dto.ts';

@Controller('agendamentos')
export class AgendamentosController {
  constructor(private readonly agendamentosService: AgendamentosService) { }

  @Post()
  async criar(
    @TenantId() tenantId: string,
    @Body() dto: CriarAgendamentoDto
  ) {
    return this.agendamentosService.criar(tenantId, dto);
  }

  @Patch(':id')
  async editar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarAgendamentoDto
  ) {
    return this.agendamentosService.editar(tenantId, id, dto);
  }

  @Get()
  async listar(
    @TenantId() tenantId: string,
    @Query('inicio') inicio?: string,
    @Query('fim') fim?: string,
    @Query('status') status?: string,
  ) {
    // Passamos as strings cruas, ou undefined se o filtro estiver vazio (Pegar Todos)
    return this.agendamentosService.listarTodos(tenantId, {
      inicio: inicio || undefined,
      fim: fim || undefined,
      status: status || undefined,
    });
  }

  @Patch(':id/cancelar')
  async cancelar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('clienteId') clienteId?: string,
  ) {
    const cId = clienteId ? parseInt(clienteId) : undefined;
    return this.agendamentosService.cancelar(tenantId, id, cId);
  }

  @Post('em-massa')
  async criarAgendaEmMassa(
    @TenantId() tenantId: string,
    @Body() agendasDto: CriarAgendaEmMassaDto 
  ) {
    return this.agendamentosService.criarAgendaEmMassa(tenantId, agendasDto.agendas);
  }
}