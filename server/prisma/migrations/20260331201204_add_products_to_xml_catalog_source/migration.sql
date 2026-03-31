-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN "categories" TEXT;
ALTER TABLE "AgentConfig" ADD COLUMN "transferConfig" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "prompIdentity" TEXT;
ALTER TABLE "Company" ADD COLUMN "prompToken" TEXT;
ALTER TABLE "Company" ADD COLUMN "prompUuid" TEXT;

-- AlterTable
ALTER TABLE "GlobalConfig" ADD COLUMN "googleMapsApiKey" TEXT;
ALTER TABLE "GlobalConfig" ADD COLUMN "googlePlacesSearchRadius" INTEGER DEFAULT 5000;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenExpires" DATETIME;

-- AlterTable
ALTER TABLE "XmlCatalogSource" ADD COLUMN "products" TEXT;
