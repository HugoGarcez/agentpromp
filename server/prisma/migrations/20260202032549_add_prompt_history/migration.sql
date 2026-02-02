-- CreateTable
CREATE TABLE "PromptHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentConfigId" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptHistory_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES "AgentConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
