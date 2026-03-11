const fs = require('fs');

function fixWebhook() {
    let content = fs.readFileSync('index.js', 'utf8');

    const originalConfigBlock = `    // Load Config EARLY (needed for Identity check)
    let followUpCfg = null;
    let config = null;
    try {
        config = await prisma.agentConfig.findFirst({ where: { companyId } });
        if (config?.followUpConfig) {
            // Safe JSON Parsing to avoid SyntaxError
            if (typeof config.followUpConfig === 'string') {
                if (config.followUpConfig.trim().startsWith('{')) {
                    followUpCfg = JSON.parse(config.followUpConfig);
                }
            } else if (typeof config.followUpConfig === 'object') {
                followUpCfg = config.followUpConfig;
            }
        }
    } catch (e) {
        console.error('[Webhook] Failed to load config:', e);
    }`;

    const newConfigBlock = `    // Load Config EARLY (needed for Identity check)
    let followUpCfg = null;
    let config = null;
    let matchedChannel = null;

    // --- V6 REAL-TIME DIAGNOSTIC RECURSIVE ID FINDER ---
    console.log(\`[Webhook-V6-ENV] PID: \${process.pid} | CWD: \${process.cwd()} | File: \${__filename}\`);

    const foundIds = new Set();
    const findIdsRecursively = (obj, currentPath = 'payload') => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            const newPath = \`\${currentPath}.\${key}\`;
            if (key === 'whatsappId' || (key === 'id' && currentPath.endsWith('.whatsapp'))) {
                if (val !== null && val !== undefined) {
                    const strVal = String(val).trim();
                    console.log(\`[Webhook-V6-DIAG] Found candidate ID '\${strVal}' at: \${newPath}\`);
                    foundIds.add(strVal);
                }
            }
            if (val && typeof val === 'object') {
                findIdsRecursively(val, newPath);
            }
        }
    };

    findIdsRecursively(payload);
    const incomingConnectionIdArr = Array.from(foundIds);

    // 2. Identify Sender and Owner Early (moved up for channel resolution)
    const rawSender = payload.key?.remoteJid || payload.contact?.number || payload.body?.contact?.number || payload.number || payload.data?.key?.remoteJid || payload.msg?.from || payload.msg?.sender;
    const cleanSender = rawSender ? String(rawSender).replace(/\\D/g, '') : '';
    
    const rawOwner = payload.msg?.owner || payload.owner;
    const cleanOwner = rawOwner ? String(rawOwner).replace(/\\D/g, '') : null;

    try {
        // MULTIPLE AGENTS RESOLUTION
        const channels = await prisma.prompChannel.findMany({
            where: { companyId },
            include: { agents: true }
        });

        // Match by Connection ID
        matchedChannel = channels.find(ch => incomingConnectionIdArr.includes(String(ch.prompConnectionId).trim()));
        
        // Match by Owner (Fallback)
        if (!matchedChannel && cleanOwner) {
            matchedChannel = channels.find(ch => String(ch.prompIdentity).replace(/\\D/g, '') === cleanOwner);
        }

        if (matchedChannel && matchedChannel.agents.length > 0) {
            config = matchedChannel.agents[0]; // Take FIRST agent
            console.log(\`[Webhook] Routed to Channel \${matchedChannel.name}, Agent: \${config.name}\`);
        } else {
            // FALLBACK
            config = await prisma.agentConfig.findFirst({ where: { companyId } });
        }

        if (config?.followUpConfig) {
            // Safe JSON Parsing to avoid SyntaxError
            if (typeof config.followUpConfig === 'string') {
                if (config.followUpConfig.trim().startsWith('{')) {
                    followUpCfg = JSON.parse(config.followUpConfig);
                }
            } else if (typeof config.followUpConfig === 'object') {
                followUpCfg = config.followUpConfig;
            }
        }
    } catch (e) {
        console.error('[Webhook] Failed to load config:', e);
    }`;

    // Now remove the duplicative Sender reading and old recursive loop
    const toRemove1 = `    // 2. Identify Sender
    const rawSender = payload.key?.remoteJid || payload.contact?.number || payload.body?.contact?.number || payload.number || payload.data?.key?.remoteJid || payload.msg?.from || payload.msg?.sender;
    const cleanSender = rawSender ? String(rawSender).replace(/\\D/g, '') : '';

    // 3. Identify Protocol Owner (The session/bot number)
    const rawOwner = payload.msg?.owner || payload.owner;
    const cleanOwner = rawOwner ? String(rawOwner).replace(/\\D/g, '') : null;`;


    const toRemove2Start = `    // --- V6 REAL-TIME DIAGNOSTIC RECURSIVE ID FINDER ---`;
    const toRemove2End = `    const incomingConnectionIdArr = Array.from(foundIds);`;

    content = content.replace(originalConfigBlock, newConfigBlock);
    content = content.replace(toRemove1, `    // 2. Sender identify moved up!`);
    
    // We will use substring to remove the recursive block
    const idx1 = content.indexOf(toRemove2Start);
    if(idx1 !== -1) {
        const idx2 = content.indexOf(toRemove2End, idx1);
        if(idx2 !== -1) {
             content = content.substring(0, idx1) + `    // Recursive ID search moved up!` + content.substring(idx2 + toRemove2End.length);
        }
    }

    // Now update dbIdentity and dbConnectionId to use matchedChannel if available
    const identitySettingBlock = `    // 4. Identify Configured Identity & Connection ID (From DB)
    let dbIdentity = null;
    let dbConnectionId = null;
    if (config) {
        if (config.prompIdentity) dbIdentity = String(config.prompIdentity).replace(/\\D/g, '');
        if (config.prompConnectionId) dbConnectionId = String(config.prompConnectionId).trim(); // Keep alphanumeric for session names
    }`;
    
    const newIdentitySettingBlock = `    // 4. Identify Configured Identity & Connection ID (From DB)
    let dbIdentity = null;
    let dbConnectionId = null;
    if (matchedChannel) {
        if (matchedChannel.prompIdentity) dbIdentity = String(matchedChannel.prompIdentity).replace(/\\D/g, '');
        if (matchedChannel.prompConnectionId) dbConnectionId = String(matchedChannel.prompConnectionId).trim();
    } else if (config) {
        if (config.prompIdentity) dbIdentity = String(config.prompIdentity).replace(/\\D/g, '');
        if (config.prompConnectionId) dbConnectionId = String(config.prompConnectionId).trim(); 
    }`;

    content = content.replace(identitySettingBlock, newIdentitySettingBlock);

    fs.writeFileSync('index.js', content, 'utf8');
    console.log('Webhook routing updated.');
}

fixWebhook();
