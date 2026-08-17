import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  ParseIntPipe
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServicosService } from './servicos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { TenantId } from '../tenant/tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantMatchGuard) // Protege todas as rotas deste arquivo
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

  // Foto + descrição pra vitrine pública (Apenas Admins/Donos)
  @Patch(':id/vitrine')
  @UseInterceptors(FileInterceptor('foto'))
  async atualizarVitrine(
    @TenantId() tenantId: string,
    @CurrentUser() usuarioLogado: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: { descricao?: string },
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    if (usuarioLogado.role !== 1) {
      throw new ForbiddenException('Apenas administradores podem editar a vitrine dos serviços.');
    }
    return this.servicosService.atualizarVitrine(tenantId, id, dados, foto);
  }
}