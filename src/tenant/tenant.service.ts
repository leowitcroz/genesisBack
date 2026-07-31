import { Injectable, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanoSaaS } from '@prisma/client';
import { MODULOS_POR_PLANO, VALOR_PADRAO_PLANO } from '../adm/planos.constants';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

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
}