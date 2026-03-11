const fs = require('fs');

async function fixFile() {
    let content = fs.readFileSync('index.js', 'utf8');

    // 1. Replace findUnique with findFirst
    content = content.replace(/prisma\.agentConfig\.findUnique\(\s*\{\s*where:\s*\{\s*companyId\s*\}\s*\}\)/g, 'prisma.agentConfig.findFirst({ where: { companyId } })');

    // 2. Replace update with companyId to updateMany
    // Actually, updateMany is safer if we just want to update the default one or all of them temporarily.
    // Or we fetch first and update by ID.
    content = content.replace(/await\s+prisma\.agentConfig\.update\(\s*\{\s*where:\s*\{\s*companyId\s*\},/g, 'await prisma.agentConfig.updateMany({ where: { companyId },');

    // 3. Replace upsert in /api/config
    const upsert1 = `const updatedConfig = await prisma.agentConfig.upsert({
            where: { companyId },
            update: data,
            create: data,
        });`;
    
    const replacement1 = `
        let updatedConfig = await prisma.agentConfig.findFirst({ where: { companyId } });
        if (updatedConfig) {
            updatedConfig = await prisma.agentConfig.update({ where: { id: updatedConfig.id }, data });
        } else {
            updatedConfig = await prisma.agentConfig.create({ data });
        }
    `;
    content = content.replace(upsert1, replacement1);

    // 4. Replace upsert in /api/promp/connect
    const upsert2 = `await prisma.agentConfig.upsert({
            where: { companyId },
            update: {
                prompIdentity: identity,
                prompConnectionId: sessionId, // NEW: Bind exactly to this Connection
                prompUuid: apiData.id,
                prompToken: apiData.token
            },
            create: {
                companyId,
                prompIdentity: identity,
                prompConnectionId: sessionId, // NEW: Bind exactly to this Connection
                prompUuid: apiData.id,
                prompToken: apiData.token
            }
        });`;
        
    const replacement2 = `
        const existingConfig = await prisma.agentConfig.findFirst({ where: { companyId } });
        if (existingConfig) {
            await prisma.agentConfig.update({
                where: { id: existingConfig.id },
                data: { prompIdentity: identity, prompConnectionId: sessionId, prompUuid: apiData.id, prompToken: apiData.token }
            });
        } else {
            await prisma.agentConfig.create({
                data: { companyId, prompIdentity: identity, prompConnectionId: sessionId, prompUuid: apiData.id, prompToken: apiData.token }
            });
        }
    `;
    content = content.replace(upsert2, replacement2);

    fs.writeFileSync('index.js', content, 'utf8');
    console.log('Fixed index.js AgentConfig queries.');
}

fixFile();
