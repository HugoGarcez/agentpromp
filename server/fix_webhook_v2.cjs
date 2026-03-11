const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');

// The block to replace: from "let config = null;" to "    // IDENTITY CHECK (Secondary/Legacy check:..." 
// Oh wait, just lines 125 to 264.

const newBlock = `    let config = null;
    let followUpCfg = null;
    let matchedChannel = null;

    // 2. Identify Sender and Owner Early
    const rawSender = payload.key?.remoteJid || payload.contact?.number || payload.body?.contact?.number || payload.number || payload.data?.key?.remoteJid || payload.msg?.from || payload.msg?.sender;
    const cleanSender = rawSender ? String(rawSender).replace(/\\D/g, '') : '';
    
    const rawOwner = payload.msg?.owner || payload.owner;
    const cleanOwner = rawOwner ? String(rawOwner).replace(/\\D/g, '') : null;

    // --- REAL-TIME DIAGNOSTIC RECURSIVE ID FINDER ---
    const foundIds = new Set();
    const findIdsRecursively = (obj, currentPath = 'payload') => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            const newPath = \`\${currentPath}.\${key}\`;
            if (key === 'whatsappId' || (key === 'id' && currentPath.endsWith('.whatsapp'))) {
                if (val !== null && val !== undefined) {
                    const strVal = String(val).trim();
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

        let agentId = null;
        if (matchedChannel && matchedChannel.agents.length > 0) {
            agentId = matchedChannel.agents[0].id; // Take FIRST agent linked to this channel
            console.log(\`[Webhook] Routed to Channel \${matchedChannel.name}, Agent ID: \${agentId}\`);
        }

        // LOAD FULL CONFIG (Global Tokens + JSON Parsed)
        config = await getCompanyConfig(companyId, agentId);

        if (config?.followUpConfig) {
            followUpCfg = config.followUpConfig; // It's already parsed by getCompanyConfig
        }
    } catch (e) {
        console.error('[Webhook] Failed to load config:', e);
    }

    // ------------------------------------------------------------------
    // 0. DEDUPLICATION (Prevent Triple Replies)
    // ------------------------------------------------------------------
    const msgId = payload.key?.id ||
        payload.id ||
        payload.data?.id ||
        payload.msg?.id ||
        payload.content?.messageId ||
        payload.body?.content?.messageId ||
        payload.ticket?.uniqueId;

    if (msgId) {
        if (processedMessages.has(msgId)) {
            console.log(\`[Webhook] Duplicate Message ID \${msgId}. Ignoring.\`);
            return res.json({ status: 'ignored_duplicate' });
        }
        processedMessages.add(msgId);
        setTimeout(() => processedMessages.delete(msgId), 15000);
    }

    // ------------------------------------------------------------------
    // LOOP PROTECTION & SENDER IDENTITY
    // ------------------------------------------------------------------

    if (payload.wasSentByApi || payload.msg?.wasSentByApi || payload.data?.wasSentByApi) {
        console.log('[Webhook] Loop Protection: Message marked as "wasSentByApi". Ignoring.');
        return res.json({ status: 'ignored_api_sent' });
    }

    // 4. Identify Configured Identity & Connection ID (From DB)
    let dbIdentity = null;
    let dbConnectionId = null;
    if (matchedChannel) {
        if (matchedChannel.prompIdentity) dbIdentity = String(matchedChannel.prompIdentity).replace(/\\D/g, '');
        if (matchedChannel.prompConnectionId) dbConnectionId = String(matchedChannel.prompConnectionId).trim();
    } else if (config) {
        // Fallback backward compat
        if (config.prompIdentity) dbIdentity = String(config.prompIdentity).replace(/\\D/g, '');
        if (config.prompConnectionId) dbConnectionId = String(config.prompConnectionId).trim(); 
    }

    if (dbConnectionId) {
        if (incomingConnectionIdArr.length === 0) {
            console.log(\`[Webhook-V6] ERROR: No WhatsApp ID found in payload (Recursive Search). Expected: '\${dbConnectionId}'. Ignoring.\`);
            return res.json({ status: 'ignored_missing_whatsapp_id' });
        }
        const hasMatch = incomingConnectionIdArr.includes(dbConnectionId);
        if (!hasMatch) {
            console.log(\`[Webhook-V6] CONNECTION ISOLATION: Expected ID '\${dbConnectionId}' NOT FOUND. Candidates: \${JSON.stringify(incomingConnectionIdArr)}. Ignoring.\`);
            return res.json({ status: 'ignored_wrong_whatsapp_id' });
        }
        console.log(\`[Webhook-V6] CONNECTION MATCH VERIFIED: ID '\${dbConnectionId}' found recursively.\`);
    }

`;

const lines = content.split('\n');
const startIdx = lines.findIndex(l => l.includes('let config = null;'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('// IDENTITY CHECK (Secondary/Legacy check:'));

if (startIdx !== -1 && endIdx !== -1) {
    const newContent = lines.slice(0, startIdx).join('\n') + '\n' + newBlock + '\n' + lines.slice(endIdx).join('\n');
    fs.writeFileSync('index.js', newContent);
    console.log('Successfully updated index.js');
} else {
    console.log('Indices not found:', startIdx, endIdx);
}
