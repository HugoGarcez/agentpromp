const fs = require('fs');
const file = 'index.js';
let content = fs.readFileSync(file, 'utf8');

// Replace findUnique
content = content.replace(/prisma\.agentConfig\.findUnique\(\{\s*where:\s*\{\s*companyId\s*\}\s*\}\)/g, 'prisma.agentConfig.findFirst({ where: { companyId } })');

// Replace standard upserts
const upsertRegex = /await\s+prisma\.agentConfig\.upsert\(\{\s*where:\s*\{\s*companyId\s*\},/g;
// Since upsert syntax has update and create, this is harder to replace with RegEx. We can replace `where: { companyId }` with `where: { id: existingConfig?.id || '' }` if we fetch first. Wait!
