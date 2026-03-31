-- CreateTable
CREATE TABLE "LeadSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadSearch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "prompIdentity" TEXT,
    "prompToken" TEXT,
    "prompUuid" TEXT,
    "leadSearchBalance" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Company" ("createdAt", "id", "name", "prompIdentity", "prompToken", "prompUuid", "updatedAt") SELECT "createdAt", "id", "name", "prompIdentity", "prompToken", "prompUuid", "updatedAt" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LeadSearch_companyId_createdAt_idx" ON "LeadSearch"("companyId", "createdAt");
