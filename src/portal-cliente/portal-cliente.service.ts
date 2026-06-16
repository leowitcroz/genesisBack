import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PortalClienteService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService
    ) {}

    // =========================================================
    // 1. REGISTRO DO CLIENTE
    // =========================================================
    async registrarCliente(tenantId: string, dados: any) {
        // Verifica se o e-mail já existe NESSA loja específica
        const clienteExistente = await this.prisma.cliente.findUnique({
            where: {
                email_tenantId: {
                    email: dados.email,
                    tenantId: tenantId
                }
            }
        });

        if (clienteExistente) {
            throw new ConflictException('Este e-mail já está cadastrado nesta loja.');
        }

        // Criptografa a senha antes de salvar
        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(dados.senha, salt);

        // Cria o cliente atrelado ao Tenant
        const novoCliente = await this.prisma.cliente.create({
            data: {
                tenantId,
                nome: dados.nome,
                email: dados.email,
                telefone: dados.telefone,
                senha: senhaHasheada,
                role: 1 // Role padrão de cliente final
            }
        });

        // Retorna o cliente sem a senha e já logado (gera o token)
        delete novoCliente.senha;
        return this.gerarTokenCliente(novoCliente, tenantId);
    }

    // =========================================================
    // 2. LOGIN DO CLIENTE
    // =========================================================
    async loginCliente(tenantId: string, email: string, senhaLimpa: string) {
        // Busca o cliente NESSA loja
        const cliente = await this.prisma.cliente.findUnique({
            where: {
                email_tenantId: { email, tenantId }
            }
        });

        if (!cliente || !cliente.senha) {
            throw new UnauthorizedException('Credenciais inválidas.');
        }

        const senhaValida = await bcrypt.compare(senhaLimpa, cliente.senha);
        if (!senhaValida) {
            throw new UnauthorizedException('Credenciais inválidas.');
        }

        delete cliente.senha;
        return this.gerarTokenCliente(cliente, tenantId);
    }

    // =========================================================
    // 3. BUSCAR DADOS DO PERFIL (Meus Agendamentos, etc)
    // =========================================================
    async obterPerfilCompleto(tenantId: string, clienteId: number) {
        const perfil = await this.prisma.cliente.findUnique({
            where: { id: clienteId },
            include: {
                // Traz os agendamentos futuros e passados do cliente
                agendamentos: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        funcionario: { select: { nome: true } },
                        horario: true
                    }
                },
                // Traz a assinatura ativa dele (se tiver)
                assinatura: {
                    include: { plano: true }
                }
            }
        });

        delete perfil.senha;
        return perfil;
    }

    // --- Função Auxiliar para gerar o JWT ---
    private gerarTokenCliente(cliente: any, tenantId: string) {
        const payload = {
            sub: cliente.id,
            email: cliente.email,
            role: cliente.role,
            tenantId: tenantId,
            userType: 'CLIENTE' // 👈 MUITO IMPORTANTE: Diferencia de 'FUNCIONARIO'
        };

        return {
            access_token: this.jwtService.sign(payload),
            cliente: cliente
        };
    }
}