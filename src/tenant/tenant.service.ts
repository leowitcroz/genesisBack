import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

    const emailExist = await this.prisma.funcionario.findFirst({
      where: { email: emailFormatado },
    });

    if (emailExist) {
      throw new ConflictException('Este e-mail já está cadastrado como administrador de uma loja.');
    }

    try {
      // 2. Executa a transação atômica
      return await this.prisma.$transaction(async (tx) => {
        
        // A. Cria o Tenant (A nova loja)
        const novoTenant = await tx.tenant.create({
          data: {
            subdomain: subdomainFormatado,
            nomeNegocio: dados.nomeNegocio,
            ativo: true,
            // Módulos iniciais que toda barbearia ganha ao registrar
            moduloAgendamento: true, 
            moduloFinanceiro: true, // Deixamos ativo para eles testarem os mocks!
            moduloAssinaturas: false,
            moduloVendas: false,
            moduloProdutos: false,
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

        return {
          sucesso: true,
          message: 'Loja e administrador configurados com sucesso!',
          loja: {
            id: novoTenant.id,
            nomeNegocio: novoTenant.nomeNegocio,
            subdomain: novoTenant.subdomain,
          },
          admin: {
            id: donoAdmin.id,
            email: donoAdmin.email,
          },
        };
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException('Erro crítico ao criar a estrutura da loja no banco.');
    }
  }
}