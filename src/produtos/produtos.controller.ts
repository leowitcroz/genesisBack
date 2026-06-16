import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  UseGuards, 
  ParseIntPipe, 
  Query
} from '@nestjs/common';
import { ProdutosService } from './produtos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantId } from '../tenant/tenant.decorator';
import { TipoProduto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly produtosService: ProdutosService, private prisma: PrismaService) {}

  @Get('item-venda')
  async listarVendas(
    @TenantId() tenantId: string,
    @Query('inicio') inicio?: string,
    @Query('fim') fim?: string,
  ) {
    const whereClause: any = { tenantId };

    if (inicio || fim) {
      whereClause.dataVenda = {};
      // Blindagem de Fuso Horário igual fizemos no Resumo Financeiro
      if (inicio) whereClause.dataVenda.gte = new Date(inicio + 'T00:00:00-03:00');
      if (fim) whereClause.dataVenda.lte = new Date(fim + 'T23:59:59-03:00');
    }

    return await this.prisma.itemVenda.findMany({
      where: whereClause,
      include: {
        funcionario: { select: { nome: true } } // Traz o nome do Vendedor
      },
      orderBy: { dataVenda: 'desc' }
    });
  }


  @Post()
  async criar(
    @TenantId() tenantId: string,
    @Body() dados: { nome: string; valor: number; estoque?: number; tipo: TipoProduto }
  ) {
    return this.produtosService.criar(tenantId, dados);
  }

  @Get()
  async listarTodos(@TenantId() tenantId: string) {
    return this.produtosService.listarTodos(tenantId);
  }

  @Post('venda')
  async vender(
    @TenantId() tenantId: string,
    @Body() dados: { 
        produtoId: number; 
        funcionarioId: number; 
        nomeItem: string; 
        tipoOrigem: TipoProduto; 
        quantidade: number; 
        valorUnitario: number; 
    }
  ) {
    return this.produtosService.realizarVenda(tenantId, dados);
  }

  @Put(':id')
  async atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: { nome?: string; valor?: number; estoque?: number; tipo?: TipoProduto }
  ) {
    return this.produtosService.atualizar(tenantId, id, dados);
  }

  @Delete(':id')
  async deletar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.produtosService.deletar(tenantId, id);
  }
}