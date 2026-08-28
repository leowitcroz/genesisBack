-- AlterTable
ALTER TABLE `AssinaturaCliente`
    ADD COLUMN `diaVencimento` INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE `FaturaAssinatura` (
    `id` VARCHAR(191) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDENTE',
    `dataReferencia` DATETIME(3) NOT NULL,
    `dataVencimento` DATETIME(3) NOT NULL,
    `dataPagamento` DATETIME(3) NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `assinaturaId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FaturaAssinatura_assinaturaId_dataVencimento_key`(`assinaturaId`, `dataVencimento`),
    INDEX `FaturaAssinatura_tenantId_idx`(`tenantId`),
    INDEX `FaturaAssinatura_assinaturaId_idx`(`assinaturaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FaturaAssinatura` ADD CONSTRAINT `FaturaAssinatura_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FaturaAssinatura` ADD CONSTRAINT `FaturaAssinatura_assinaturaId_fkey` FOREIGN KEY (`assinaturaId`) REFERENCES `AssinaturaCliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
