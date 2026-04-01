-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LeadSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "leadsFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadSearch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LeadSearch" ("companyId", "createdAt", "id") SELECT "companyId", "createdAt", "id" FROM "LeadSearch";
DROP TABLE "LeadSearch";
ALTER TABLE "new_LeadSearch" RENAME TO "LeadSearch";
CREATE INDEX "LeadSearch_companyId_createdAt_idx" ON "LeadSearch"("companyId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
