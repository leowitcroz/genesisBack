import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  UseGuards, 
  ParseIntPipe
} from '@nestjs/common';
import { ServicosService } from './servicos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantId } from '../tenant/tenant.decorator';

@UseGuards(JwtAuthGuard) // Protege todas as rotas deste arquivo
@Controller('servicos')
export class ServicosController {
  constructor(private readonly servicosService: ServicosService) {}

  @Post()
  async criar(
    @TenantId() tenantId: string,
    @Body() dados: { nome: string; valor: number }
  ) {
    return this.servicosService.criar(tenantId, dados);
  }

  @Get()
  async listarTodos(@TenantId() tenantId: string) {
    return this.servicosService.listarTodos(tenantId);
  }

  @Put(':id')
  async atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: { nome?: string; valor?: number }
  ) {
    return this.servicosService.atualizar(tenantId, id, dados);
  }

  @Delete(':id')
  async deletar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.servicosService.deletar(tenantId, id);
  }
}