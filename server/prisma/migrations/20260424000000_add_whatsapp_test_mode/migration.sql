-- AlterTable
ALTER TABLE "PrompChannel" ADD COLUMN "whatsappTestMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrompChannel" ADD COLUMN "whatsappTestNumber" TEXT;
