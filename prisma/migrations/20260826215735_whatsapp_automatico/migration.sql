-- AlterTable
ALTER TABLE `Cliente`
    ADD COLUMN `dataNascimento` DATE NULL,
    ADD COLUMN `ultimoAnoAniversarioEnviado` INTEGER NULL;

-- AlterTable
ALTER TABLE `Agendamento`
    ADD COLUMN `notaCliente` VARCHAR(500) NULL,
    ADD COLUMN `telefoneCliente` VARCHAR(20) NULL,
    ADD COLUMN `confirmacaoEnviadaEm` DATETIME(3) NULL,
    ADD COLUMN `lembreteVesperaEnviadoEm` DATETIME(3) NULL,
    ADD COLUMN `lembreteDiaDaEnviadoEm` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `TenantWhatsapp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` VARCHAR(191) NOT NULL,
    `status` ENUM('DESCONECTADO', 'CONECTADO', 'ERRO') NOT NULL DEFAULT 'DESCONECTADO',
    `wabaId` VARCHAR(50) NULL,
    `phoneNumberId` VARCHAR(50) NULL,
    `numeroExibicao` VARCHAR(20) NULL,
    `accessTokenCriptografado` TEXT NULL,
    `conectadoEm` DATETIME(3) NULL,
    `ultimoErro` TEXT NULL,
    `modoSimulado` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantWhatsapp_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantWhatsappTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantWhatsappId` INTEGER NOT NULL,
    `tipo` ENUM('CONFIRMACAO', 'VESPERA', 'DIA_DA', 'ANIVERSARIO') NOT NULL,
    `nomeMeta` VARCHAR(100) NOT NULL,
    `status` ENUM('NAO_ENVIADO', 'PENDENTE', 'APROVADO', 'REJEITADO') NOT NULL DEFAULT 'NAO_ENVIADO',
    `motivoRejeicao` TEXT NULL,
    `aprovadoEm` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantWhatsappTemplate_tenantWhatsappId_tipo_key`(`tenantWhatsappId`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsappEnvioLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('CONFIRMACAO', 'VESPERA', 'DIA_DA', 'ANIVERSARIO') NOT NULL,
    `destinatario` VARCHAR(20) NOT NULL,
    `clienteId` INTEGER NULL,
    `agendamentoId` INTEGER NULL,
    `simulado` BOOLEAN NOT NULL DEFAULT true,
    `sucesso` BOOLEAN NOT NULL DEFAULT true,
    `payloadRenderizado` JSON NULL,
    `erro` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WhatsappEnvioLog_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TenantWhatsapp` ADD CONSTRAINT `TenantWhatsapp_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantWhatsappTemplate` ADD CONSTRAINT `TenantWhatsappTemplate_tenantWhatsappId_fkey` FOREIGN KEY (`tenantWhatsappId`) REFERENCES `TenantWhatsapp`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WhatsappEnvioLog` ADD CONSTRAINT `WhatsappEnvioLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
