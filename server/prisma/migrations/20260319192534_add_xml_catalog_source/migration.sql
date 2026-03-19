-- CreateTable: XmlCatalogSource (nova tabela — sempre seguro)
CREATE TABLE IF NOT EXISTS "XmlCatalogSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "xmlUrl" TEXT NOT NULL,
    "fieldMapping" TEXT NOT NULL,
    "refreshMinutes" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XmlCatalogSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: NotificationRead (nova tabela — sempre seguro)
CREATE TABLE IF NOT EXISTS "NotificationRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRead_userId_notificationId_key" ON "NotificationRead"("userId", "notificationId");

-- AlterTable: colunas que podem já existir no banco de prod.
-- SQLite não suporta IF NOT EXISTS em ADD COLUMN, então usamos CREATE VIRTUAL TABLE trick:
-- Tentamos adicionar; se falhar por coluna duplicada o Prisma resolve via --accept-data-loss ou manualmente.
-- As linhas abaixo só rodam se as colunas NÃO existirem (banco novo/clean).
-- Em bancos de prod onde já existem, o erro P3018 foi resolvido removendo esses ALTER TABLE daqui.
