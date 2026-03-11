const fs = require('fs');

function fixConnectLogic() {
    // 1. Frontend: Add agentId to payload
    let settingsContent = fs.readFileSync('../src/pages/Settings.jsx', 'utf8');
    settingsContent = settingsContent.replace(
        "sessionId: document.getElementById('prompSessionInput').value,",
        "sessionId: document.getElementById('prompSessionInput').value,\n                                                    agentId: selectedAgentId,"
    );
    fs.writeFileSync('../src/pages/Settings.jsx', settingsContent, 'utf8');

    // 2. Backend: Add connection bridging
    let serverContent = fs.readFileSync('index.js', 'utf8');
    const oldUpsert = `        await prisma.prompChannel.upsert({
            where: { companyId_prompUuid: { companyId, prompUuid: apiData.id } },
            update: {
                name: targetTenant.name + ' (' + sessionId + ')',
                prompIdentity: identity,
                prompConnectionId: sessionId,
                prompToken: apiData.token
            },
            create: {
                companyId,
                name: targetTenant.name + ' (' + sessionId + ')',
                prompIdentity: identity,
                prompConnectionId: sessionId,
                prompUuid: apiData.id,
                prompToken: apiData.token
            }
        });`;
        
    const newUpsert = `        const newChannel = await prisma.prompChannel.upsert({
            where: { companyId_prompUuid: { companyId, prompUuid: apiData.id } },
            update: {
                name: targetTenant.name + ' (' + sessionId + ')',
                prompIdentity: identity,
                prompConnectionId: sessionId,
                prompToken: apiData.token
            },
            create: {
                companyId,
                name: targetTenant.name + ' (' + sessionId + ')',
                prompIdentity: identity,
                prompConnectionId: sessionId,
                prompUuid: apiData.id,
                prompToken: apiData.token
            }
        });
        
        // Link to explicit agent if provided
        if (req.body.agentId) {
            await prisma.prompChannel.update({
                where: { id: newChannel.id },
                data: { agents: { connect: { id: req.body.agentId } } }
            });
        }`;

    // Also need to correctly destructure agentId in /api/promp/connect
    const oldDestructure = `    const { identity, sessionId, manualUserId } = req.body;`;
    const newDestructure = `    const { identity, sessionId, manualUserId, agentId } = req.body;`;

    serverContent = serverContent.replace(oldDestructure, newDestructure);
    serverContent = serverContent.replace(oldUpsert, newUpsert);

    fs.writeFileSync('index.js', serverContent, 'utf8');
    console.log('Connect logic linked with Agents successfully.');
}

try { fixConnectLogic(); } catch (e) { console.error('Error applying fix:', e.message); }
