import { Injectable, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanoSaaS } from '@prisma/client';
import { MODULOS_POR_PLANO, VALOR_PADRAO_PLANO } from '../adm/planos.constants';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async cadastrarLojaSaaS(dados: any) {
    const subdomainFormatado = dados.subdomain.toLowerCase().trim();
    const emailFormatado = dados.email.toLowerCase().trim();

    // 1. Validações Prévias
    const subdomainExist = await this.prisma.tenant.findUnique({
      where: { subdomain: subdomainFormatado },
    });

    if (subdomainExist) {
      throw new ConflictException('Este subdomínio já está sendo utilizado por outra loja.');
    }

    // Verifica se o e-mail já existe na tabela de funcionários (barbeiros/admins)
    const emailFuncionarioExist = await this.prisma.funcionario.findFirst({
      where: { email: emailFormatado },
    });

    if (emailFuncionarioExist) {
      throw new ConflictException('Este e-mail já está cadastrado como administrador de uma loja.');
    }

    // Verifica se o e-mail já existe na tabela de clientes
    const emailClienteExist = await this.prisma.cliente.findFirst({
      where: { email: emailFormatado },
    });

    if (emailClienteExist) {
      throw new ConflictException('Este e-mail já está cadastrado no sistema por um cliente.');
    }

    const plano: PlanoSaaS = dados.plano && Object.values(PlanoSaaS).includes(dados.plano) ? dados.plano : PlanoSaaS.BASICO;
    const modulosDoPlano = MODULOS_POR_PLANO[plano];

    try {
      // 2. Executa a transação atômica
      return await this.prisma.$transaction(async (tx) => {

        // A. Cria o Tenant (A nova loja)
        // 👇 Nasce BLOQUEADA (ativo: false) — só libera quando o ADM confirmar o primeiro pagamento
        // Módulos liberados seguem o plano escolhido (ver src/adm/planos.constants.ts)
        const novoTenant = await tx.tenant.create({
          data: {
            subdomain: subdomainFormatado,
            nomeNegocio: dados.nomeNegocio,
            ativo: false,
            planoSaaS: plano,
            moduloFinanceiro: modulosDoPlano.moduloFinanceiro,
            moduloAgendamento: modulosDoPlano.moduloAgendamento,
            moduloProdutos: modulosDoPlano.moduloProdutos,
            moduloVendas: modulosDoPlano.moduloVendas,
            moduloAssinaturas: false,
          },
        });

        // B. Criptografa a senha do Dono/Admin
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(dados.password, salt);

        // C. Cria o usuário do Dono atrelado a essa nova loja
        const donoAdmin = await tx.funcionario.create({
          data: {
            tenantId: novoTenant.id,
            nome: `Admin ${dados.nomeNegocio}`,
            email: emailFormatado,
            password: passwordHash,
            role: 1, // 1 = Dono / Administrador com acesso total
            ativo: true,
          },
        });

        // 🟢 D. Cria a primeira fatura, já vencendo agora (a loja está bloqueada até ela ser paga)
        const dataInicio = new Date();

        const precoConfigurado = await tx.planoPreco.findUnique({ where: { plano } });
        const valorFatura = dados.valorPlano ?? (precoConfigurado ? Number(precoConfigurado.valorMensal) : VALOR_PADRAO_PLANO[plano]);

        const primeiraFatura = await tx.faturaSaaS.create({
          data: {
            tenantId: novoTenant.id,
            valor: valorFatura,
            status: 'PENDENTE',
            dataInicio: dataInicio,
            dataVencimento: dataInicio,
          },
        });

        return {
          sucesso: true,
          message: 'Loja, administrador e controle financeiro configurados com sucesso!',
          loja: {
            id: novoTenant.id,
            nomeNegocio: novoTenant.nomeNegocio,
            subdomain: novoTenant.subdomain,
          },
          admin: {
            id: donoAdmin.id,
            email: donoAdmin.email,
          },
          financeiroInicial: {
            id: primeiraFatura.id,
            valor: primeiraFatura.valor,
            status: primeiraFatura.status,
            vencimento: primeiraFatura.dataVencimento,
          }
        };
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException('Erro crítico ao criar a estrutura da loja no banco.');
    }
  }

  async obterPlanoPorId(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    // Retorna todos os dados do tenant, incluindo os booleanos dos módulos (moduloFinanceiro, moduloAgendamento, etc)
    return tenant;
  }

  // =========================================================
  // VITRINE PÚBLICA (landing page do subdomínio da loja)
  // =========================================================

  async atualizarWhatsapp(tenantId: string, whatsapp: string) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { whatsapp: whatsapp || null }
    });
  }

  async atualizarVitrine(tenantId: string, dados: {
    corPrimaria?: string;
    corSecundaria?: string;
    descricaoLoja?: string;
    endereco?: string;
    instagram?: string;
  }) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dados.corPrimaria !== undefined && { corPrimaria: dados.corPrimaria }),
        ...(dados.corSecundaria !== undefined && { corSecundaria: dados.corSecundaria }),
        ...(dados.descricaoLoja !== undefined && { descricaoLoja: dados.descricaoLoja || null }),
        ...(dados.endereco !== undefined && { endereco: dados.endereco || null }),
        ...(dados.instagram !== undefined && { instagram: dados.instagram || null }),
      }
    });
  }

  // Banner da vitrine pública (subdomínio raiz) — sobe pro Cloudinary.
  async atualizarBanner(tenantId: string, foto: Express.Multer.File) {
    const bannerUrl = await this.cloudinaryService.uploadImagem(foto.buffer, `wsdigital/${tenantId}/banner`);
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { bannerUrl }
    });
  }

  // Dados completos da PRÓPRIA vitrine pro dono editar (sem o limite de 12
  // serviços nem o corte de "só ativos" da versão pública — aqui ele precisa
  // ver e editar tudo).
  async obterMinhaVitrine(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        nomeNegocio: true,
        corPrimaria: true,
        corSecundaria: true,
        bannerUrl: true,
        descricaoLoja: true,
        endereco: true,
        instagram: true,
        whatsapp: true,
        subdomain: true,
      }
    });

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    const [servicos, equipeCompleta, planos] = await Promise.all([
      this.prisma.servico.findMany({
        where: { tenantId },
        select: { id: true, nome: true, valor: true, fotoUrl: true, descricao: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.funcionario.findMany({
        where: { tenantId, ativo: true, isPlatformOwner: false },
        select: { id: true, nome: true, fotoUrl: true, descricao: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.planoAssinatura.findMany({
        where: { tenantId, ativo: true },
        select: { id: true, nome: true, valorMensal: true, qtdCreditos: true, servicos: { select: { nome: true } } },
        orderBy: { valorMensal: 'asc' },
      }),
    ]);

    // Mesmo corte da versão pública: a conta "Admin {loja}" administra, não
    // presta o serviço — editar a bio dela aqui não teria efeito nenhum na
    // vitrine de verdade, então nem faz sentido oferecer.
    const equipe = equipeCompleta.filter(f => !f.nome.trim().toLowerCase().startsWith('admin'));

    return { ...tenant, servicos, equipe, planos };
  }

  // Payload público consumido pela vitrine (landing page) do subdomínio da loja.
  async obterVitrine(subdomain: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain },
      select: {
        id: true,
        nomeNegocio: true,
        corPrimaria: true,
        corSecundaria: true,
        bannerUrl: true,
        descricaoLoja: true,
        endereco: true,
        instagram: true,
        whatsapp: true,
        moduloAssinaturas: true,
      }
    });

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    // Se for a própria loja do dono da plataforma, não é um cliente de verdade
    // — não faz sentido mostrar vitrine/serviços/equipe genéricos dela.
    const donoPlataforma = await this.prisma.funcionario.findFirst({
      where: { tenantId: tenant.id, isPlatformOwner: true },
      select: { id: true }
    });

    if (donoPlataforma) {
      return { ...tenant, ehPlataformaPropria: true, servicos: [], equipe: [], planos: [] };
    }

    const [servicos, equipeCompleta, planos] = await Promise.all([
      this.prisma.servico.findMany({
        where: { tenantId: tenant.id },
        select: { nome: true, valor: true, fotoUrl: true, descricao: true },
        orderBy: { nome: 'asc' },
        take: 12,
      }),
      this.prisma.funcionario.findMany({
        where: { tenantId: tenant.id, ativo: true, isPlatformOwner: false },
        select: { nome: true, fotoUrl: true, descricao: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.planoAssinatura.findMany({
        where: { tenantId: tenant.id, ativo: true },
        select: { id: true, nome: true, valorMensal: true, qtdCreditos: true, servicos: { select: { nome: true } } },
        orderBy: { valorMensal: 'asc' },
      }),
    ]);

    // A conta "Admin {loja}" administra, não presta o serviço — não faz
    // sentido aparecer na vitrine da equipe.
    const equipe = equipeCompleta.filter(f => !f.nome.trim().toLowerCase().startsWith('admin'));

    return { ...tenant, ehPlataformaPropria: false, servicos, equipe, planos };
  }
}