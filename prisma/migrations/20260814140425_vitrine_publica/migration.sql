-- AlterTable
ALTER TABLE `Tenant`
    ADD COLUMN `corPrimaria` VARCHAR(7) NOT NULL DEFAULT '#4F46E5',
    ADD COLUMN `corSecundaria` VARCHAR(7) NOT NULL DEFAULT '#1E1B3A',
    ADD COLUMN `bannerUrl` VARCHAR(500) NULL,
    ADD COLUMN `descricaoLoja` TEXT NULL,
    ADD COLUMN `endereco` VARCHAR(255) NULL,
    ADD COLUMN `instagram` VARCHAR(100) NULL,
    ADD COLUMN `whatsapp` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `Servico`
    ADD COLUMN `fotoUrl` VARCHAR(500) NULL,
    ADD COLUMN `descricao` TEXT NULL;

-- AlterTable
ALTER TABLE `Funcionario`
    ADD COLUMN `descricao` TEXT NULL;
