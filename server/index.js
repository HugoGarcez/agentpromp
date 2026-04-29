import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp'; // Start using sharp
import FormData from 'form-data';
import multer from 'multer'; // Multer para File Uploads
import { transcribeAudio, generateAudio, resolveVoiceFromAgent } from './audioActions.js';
import fsCommon from 'fs'; // For synchronous appendFileSync
import { XMLParser } from 'fast-xml-parser'; // XML Catalog Integration

// Helper for file logging
const logFlow = (msg) => {
    try {
        const timestamp = new Date().toISOString();
        fsCommon.appendFileSync('debug_flow.txt', `[${timestamp}] ${msg}\n`);
    } catch (e) { /* ignore */ }
};
import { initScheduler } from './scheduler.js';
import { appendConversationHistory, runCRMAutomationJob, listCrmPipelines, listCrmOpportunities, updateCrmOpportunity, deleteCrmOpportunity, createCrmOpportunity, evaluateOpportunityCreation, listCrmUsers } from './crmAutomation.js';
import { extractFromUrl } from './extractor.js';
import {
    generateAuthUrl,
    handleOAuthCallback,
    listCalendars,
    checkAvailability,
    createCalendarEvent
} from './googleCalendar.js';
import { sendPrompMessage, getPrompTags, applyPrompTag, createPrompTag, updatePrompTag, deletePrompTag, sendPrompPresence, downloadAndDecryptWhatsAppMedia, getPrompUsers, getPrompQueues, setTicketInfo, createTicketNote } from './prompUtils.js';
import {
    shouldTriggerConditionalTransfer,
    handleCollectionStep,
    getInitialMessages,
    renderTemplate,
    generateTransferId,
    maskSensitiveData
} from './conditionalTransfer.js';
import {
    getUazapiConfig,
    calcPresenceDuration,
    sendPresenceAndWait,
    shouldShowCatalog,
    sendCatalogCarousel,
    sendUazapiAudio,
    reactToUserMessage
} from './uazapiUtils.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const PROMP_ADMIN_TOKEN = process.env.PROMP_ADMIN_TOKEN;
const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';

// GLOBAL DEDUPLICATION SET
const processedMessages = new Set();

// NUMBER VALIDATION CACHE (Token_Number -> isValid)
const validNumbersCache = new Map();

// --- PROMP CHANNELS CACHE ---
let globalChannelsCache = [];
let lastChannelsCacheTime = 0;
const CHANNELS_CACHE_TTL = 30000; // 30 seconds

async function getGlobalChannels() {
    const now = Date.now();
    if (globalChannelsCache.length > 0 && (now - lastChannelsCacheTime < CHANNELS_CACHE_TTL)) {
        return globalChannelsCache;
    }
    try {
        const channels = await prisma.prompChannel.findMany({ include: { agents: true } });
        globalChannelsCache = channels;
        lastChannelsCacheTime = now;
        return channels;
    } catch (e) {
        console.error('[Cache] Failed to load channels:', e);
        return globalChannelsCache; // Fallback to stale
    }
}

const app = express();

const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'; // In production use .env

const prisma = new PrismaClient();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// DEBUG: Log all requests
app.use((req, res, next) => {
    // Ignore health check to avoid spam
    if (req.path !== '/api/health') {
        console.log(`[Request] ${req.method} ${req.path}`);
    }
    next();
});

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('[Auth] No token provided');
        return res.status(401).json({ error: 'Unauthorized', message: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('[Auth] Token invalid/expired');
            return res.status(403).json({ error: 'Forbidden', message: 'Token inválido ou expirado' });
        }
        req.user = user;
        // console.log(`[Auth] User authenticated: ${user.companyId || user.id}`);
        next();
    });
};

// Initialize Scheduler (Pass Prisma Instance)
initScheduler(prisma);

// --- HEALTH CHECK ROUTE (NO AUTH - defined BEFORE auth middleware if desired, or after) ---
// Defined here to be publicly accessible
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '2.0.0-REALTIME-INVENTORY', time: new Date().toISOString() });
});

// --- WEBHOOK ROUTES (Moved to TOP for Priority) ---
const handleWebhookRequest = async (req, res) => {
    let companyId = req.params.companyId;
    console.log(`[Webhook] HEADERS Content-Type: ${req.get('Content-Type')}`);
    console.log(`[Webhook] Handler Reached for Company: ${companyId}`);

    // --- PAYLOAD NORMALIZATION ---
    let payload = req.body;
    if (Array.isArray(payload)) {
        console.log(`[Webhook] Payload is an Array. Taking first item.`);
        payload = payload[0];
    }

    if (!payload || Object.keys(payload).length === 0) {
        console.error('[Webhook] Empty Payload! Check Content-Type.');
    } else {
        console.log(`[Webhook] FULL PAYLOAD (${companyId}):`, JSON.stringify(payload, null, 2));
    }


    // Load Config EARLY (needed for Identity check)
    let followUpCfg = null;
    let config = null;
    let agentId = null;
    let matchedChannel = null;

    // 2. Identify Sender and Owner Early
    let rawSender = payload.key?.remoteJid || payload.contact?.number || payload.body?.contact?.number || 
                      payload.number || payload.data?.key?.remoteJid || payload.msg?.from || payload.msg?.sender ||
                      payload.ticket?.contact?.number || payload.sender?.number;
    let cleanSender = rawSender ? String(rawSender).replace(/\D/g, '') : '';
    
    let rawOwner = payload.msg?.owner || payload.owner || payload.to || payload.msg?.to || 
                      payload.ticket?.owner || payload.ticket?.destination || payload.ticket?.whatsappId ||
                      payload.data?.to || payload.data?.owner || payload.destination;
    let cleanOwner = rawOwner ? String(rawOwner).replace(/\D/g, '') : null;
    console.log(`[Webhook] Identified Owner: ${cleanOwner} (Raw: ${rawOwner})`);

    // --- REAL-TIME DIAGNOSTIC RECURSIVE ID FINDER ---
    const foundIds = new Set();
    const findIdsRecursively = (obj, currentPath = 'payload') => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            const newPath = `${currentPath}.${key}`;
            const lowerKey = key.toLowerCase();
            const idKeys = ['whatsappid', 'instanceid', 'connectionid', 'wabaid', 'sessionid', 'sessionname', 'session', 'channelid', 'channel_id', 'cid', 'wid', 'tokenapi', 'uuid'];
            
            if (idKeys.includes(lowerKey) || (lowerKey === 'id' && currentPath.endsWith('.whatsapp'))) {
                if (val !== null && val !== undefined && (typeof val === 'string' || typeof val === 'number')) {
                    const strVal = String(val).trim();
                    if (strVal) {
                        // PRIORITIZE UUID FORMAT: If it looks like a UUID, put it at the front of the array later
                        // or just add it normally. The matching logic will find it.
                        foundIds.add(strVal);
                    }
                }
            }
            if (val && typeof val === 'object') {
                findIdsRecursively(val, newPath);
            }
        }
    };
    findIdsRecursively(payload);
    
    // Sort so that UUID-like strings (8-4-4-4-12) come first in the array
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const incomingConnectionIdArr = Array.from(foundIds).sort((a, b) => {
        const aIsUuid = uuidRegex.test(a);
        const bIsUuid = uuidRegex.test(b);
        if (aIsUuid && !bIsUuid) return -1;
        if (!aIsUuid && bIsUuid) return 1;
        return 0;
    });

    try {
        // MULTIPLE AGENTS RESOLUTION
        // 1. CARREGAR CANAIS GLOBALMENTE (Com Cache)
        const allChannels = await getGlobalChannels();

        // 2. IDENTIFICAR DESTINATÁRIO
        let destNumber = payload.msg?.from || payload.ticket?.contact?.number || null;
        if (destNumber) destNumber = String(destNumber).replace(/\D/g, '');

        // 3. MATCHING GLOBAL (Prioritize Destination for Cross-Channel Support)
        const matchedByDest = (destNumber && destNumber !== cleanOwner) ? allChannels.find(ch => ch.prompIdentity && String(ch.prompIdentity).replace(/\D/g, '') === destNumber) : null;
        const matchedByOwner = allChannels.find(ch => 
            (ch.prompIdentity && String(ch.prompIdentity).replace(/\D/g, '') === cleanOwner) ||
            incomingConnectionIdArr.includes(String(ch.prompConnectionId).trim()) ||
            (ch.prompUuid && incomingConnectionIdArr.includes(String(ch.prompUuid).trim()))
        );

        matchedChannel = matchedByDest || matchedByOwner;

        // WhatsApp Test Mode: only respond to the configured test number
        if (matchedChannel?.whatsappTestMode) {
            const testNum = matchedChannel.whatsappTestNumber?.replace(/\D/g, '');
            if (testNum && cleanSender !== testNum) {
                console.log(`[Webhook] Test mode active on ${matchedChannel.name}. Ignoring sender ${cleanSender} (allowed: ${testNum})`);
                return res.json({ status: 'ignored_test_mode_active' });
            }
        }

        // 4. BYPASS NATIVO (Se o canal for o DESTINATÁRIO)
        let isCrossChannelSend = false;
        let targetChannel = null;

        if (matchedChannel && destNumber && String(matchedChannel.prompIdentity).replace(/\D/g, '') === destNumber) {
            targetChannel = matchedChannel; // Salva o canal B
            isCrossChannelSend = true;
            console.log(`[Webhook] CROSS-CHANNEL DETECTED: Dest ${destNumber} is local channel ${targetChannel.name}.`);
            
            // Forçar fromMe = false para responder em inbound
            if (payload.msg) payload.msg.fromMe = false;

            // Inverter papéis: Encontrar o canal remetente (Canal A)
            const senderChannel = allChannels.find(ch => String(ch.prompIdentity).replace(/\D/g, '') === cleanOwner);

            companyId = targetChannel.companyId; // Override Company ID!

            if (senderChannel && senderChannel.prompIdentity) {
                rawSender = senderChannel.prompIdentity;
                cleanSender = String(senderChannel.prompIdentity).replace(/\D/g, '');
            }
            rawOwner = targetChannel.prompIdentity;
            cleanOwner = String(targetChannel.prompIdentity).replace(/\D/g, '');

            console.log(`[Webhook] Flipped roles for Cross-Channel. New Company: ${companyId}, New Sender: ${cleanSender}, New Owner: ${cleanOwner}`);
        } else {
            // Se NÃO for resposta cruzada e for um método de envio, tratar ignore
            const isSendMethod = payload.method && payload.method.toLowerCase().includes('_send');
            const isFromMeMsg = payload.method === 'message' && payload.msg?.fromMe === true;

            if (isSendMethod || isFromMeMsg) {
                if (isSendMethod) {
                    console.log(`[Webhook] Ignoring outbound method: ${payload.method}`);
                    return res.json({ status: 'ignored_outbound' });
                }
            }
        }

        // Variável 'channels' para compatibilidade com logs de diagnósticos subsequentes
        const channels = allChannels;

        // --- DIAGNOSTICS: NO CHANNEL MATCHED ---
        if (!matchedChannel && channels.length > 0) {
            console.log(`[Webhook] WARNING: No channel matched for Company ${companyId}. Expected Identities: ${channels.map(c => c.prompIdentity).join(', ')}. Payload Owner: ${cleanOwner}`);
        } else if (channels.length === 0) {
            console.log(`[Webhook] WARNING: Company ${companyId} has NO PROMP CHANNELS LINKED.`);
        }

        // --- IDENTITY & UUID HEALING ---
        // Se batemos pelo Connection ID, vamos garantir que o UUID e a Identity (fone) do canal estejam corretos.
        if (matchedChannel) {
            const updates = {};
            const incomingUuid = incomingConnectionIdArr.find(id => uuidRegex.test(id));
            
            // 1. Heal Identity (Phone number)
            if (cleanOwner && matchedChannel.prompIdentity !== cleanOwner) {
                if (String(matchedChannel.prompIdentity).length < 6) { // Provavelmente é um ID interno legado
                    console.log(`[Webhook] Healing Identity for channel ${matchedChannel.name}: ${matchedChannel.prompIdentity} -> ${cleanOwner}`);
                    matchedChannel.prompIdentity = cleanOwner; // In-memory
                    updates.prompIdentity = cleanOwner;
                }
            }

            // 2. Heal UUID (Session ID)
            // CRITICAL: ONLY heal if the channel doesn't already have a valid specialized UUID.
            // If the user manually set a UUID, we MUST protect it from being overwritten by the webhook payload (which might contain the global one).
            const isManuallyConfigured = matchedChannel.prompUuid && uuidRegex.test(matchedChannel.prompUuid);

            if (incomingUuid && !isManuallyConfigured && matchedChannel.prompUuid !== incomingUuid) {
                console.log(`[Webhook] Healing UUID for channel ${matchedChannel.name}: ${matchedChannel.prompUuid} -> ${incomingUuid}`);
                matchedChannel.prompUuid = incomingUuid; // In-memory
                updates.prompUuid = incomingUuid;
            }

            if (Object.keys(updates).length > 0) {
                prisma.prompChannel.update({
                    where: { id: matchedChannel.id },
                    data: updates
                }).catch(e => console.error('[Webhook] Failed to persist channel heals:', e));
            }
        }


        if (matchedChannel && matchedChannel.agents.length > 0) {
            agentId = matchedChannel.agents[0].id; // Take FIRST agent linked to this channel
            console.log(`[Webhook] Routed to Channel ${matchedChannel.name}, Agent ID: ${agentId}`);
        } else if (matchedChannel) {
            console.log(`[Webhook] Channel ${matchedChannel.name} found but has no agents linked.`);
        }

        // PREVENT FALLBACK: In multi-agent setup, if no agent linked, ignore to prevent cross-talk
        if (!agentId) {
            console.log(`[Webhook] WARNING: No agent resolved for message. Ignoring to prevent cross-talk.`);
            return res.json({ status: 'ignored_unlinked_channel' });
        }

        // LOAD FULL CONFIG (Global Tokens + JSON Parsed)
        config = await getCompanyConfig(companyId, agentId);
        if (config) {
            console.log(`[Webhook] Config loaded for Company: ${companyId}, Agent: ${agentId || 'Global'}. Transfer rules: ${Array.isArray(config.transferConfig) ? config.transferConfig.length : 0}`);
        }

        // --- MULTI-CHANNEL CREDENTIAL OVERRIDE ---
        if (matchedChannel && config) {
            if (matchedChannel.prompIdentity) config.prompIdentity = matchedChannel.prompIdentity;

            // --- CREDENTIALS PRIORITY (SPECIFIC > GLOBAL) ---
            // Priorizamos o que for mais específico para garantir que a sessão correta seja usada.
            
            let source = 'Default';
            const agentUuid = config.prompUuid; 
            const agentToken = config.prompToken;

            // 1. UUID Priority: Channel (Specific) > Agent/Company > Webhook URL
            if (matchedChannel.prompUuid && uuidRegex.test(matchedChannel.prompUuid)) {
                config.prompUuid = matchedChannel.prompUuid;
                source = 'Channel (Specific)';
            } else if (agentUuid && uuidRegex.test(agentUuid)) {
                config.prompUuid = agentUuid;
                source = 'Agent/Global Config (DB)';
            } else if (uuidRegex.test(companyId)) {
                config.prompUuid = companyId;
                source = 'Webhook URL fallback';
            }

            // 2. Token Priority: Channel (Specific) > Agent/Company
            if (matchedChannel.prompToken && matchedChannel.prompToken.length > 10 && !uuidRegex.test(matchedChannel.prompToken)) {
                config.prompToken = matchedChannel.prompToken;
                if (source === 'Agent/Global Config (DB)') source = 'Mixed (Agent UUID + Channel Token)';
            } else if (agentToken && agentToken.length > 10 && !uuidRegex.test(agentToken)) {
                config.prompToken = agentToken;
            }

            console.log(`[Webhook] Credentials Configured for ${matchedChannel.name}: UUID=${config.prompUuid}, PrompToken=${config.prompToken?.substring(0, 5)}... (Source: ${source})`);
            const uazapiLog = getUazapiConfig(config);
            if (uazapiLog) {
                console.log(`[Webhook] Uazapi Token Resolved: ${uazapiLog.tokenAPI.substring(0, 8)}...`);
            }
        }

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
        // SCOPE DEDUPLICATION BY CHANNEL ID AND MESSAGE ID (Prevent sender/receiver collisions)
        const dupKey = `${matchedChannel ? matchedChannel.id : companyId}_${msgId}`;

        if (processedMessages.has(dupKey)) {
            console.log(`[Webhook] Duplicate Message ID ${dupKey}. Ignoring.`);
            return res.json({ status: 'ignored_duplicate_scoped' });
        }
        processedMessages.add(dupKey);
        setTimeout(() => processedMessages.delete(dupKey), 15000);
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
        if (matchedChannel.prompIdentity) dbIdentity = String(matchedChannel.prompIdentity).replace(/\D/g, '');
        if (matchedChannel.prompConnectionId) dbConnectionId = String(matchedChannel.prompConnectionId).trim();
    } else if (config) {
        // Fallback backward compat
        if (config.prompIdentity) dbIdentity = String(config.prompIdentity).replace(/\D/g, '');
        if (config.prompConnectionId) dbConnectionId = String(config.prompConnectionId).trim(); 
    }

    if (dbConnectionId && !matchedChannel) { 
        // Only enforce isolation if we HAVEN'T matched by Identity (Owner) yet.
        // If we matched by Identity, we trust that more than recursive ID finding.
        if (incomingConnectionIdArr.length > 0) {
            const hasMatch = incomingConnectionIdArr.includes(dbConnectionId);
            if (!hasMatch) {
                console.log(`[Webhook-V6] CONNECTION ISOLATION: Expected ID '${dbConnectionId}' NOT FOUND. Candidates: ${JSON.stringify(incomingConnectionIdArr)}. Ignoring to prevent cross-account replies.`);
                return res.json({ status: 'ignored_wrong_whatsapp_id' });
            }
            console.log(`[Webhook-V6] CONNECTION MATCH VERIFIED: ID '${dbConnectionId}' found recursively.`);
        }
    } else if (dbConnectionId && matchedChannel) {
        console.log(`[Webhook-V6] Proceeding with matched channel by Identity: ${matchedChannel.name} (ID: ${dbConnectionId})`);
    }


    // IDENTITY CHECK (Secondary/Legacy check: "Consider ONLY what is sent TO the number that is in the AI")
    // If the payload says the owner is X, but the DB config says Identity is Y, IGNORE.
    // --- V7: BYPASS IF CONNECTION MATCHED ---
    if (dbIdentity && cleanOwner && dbIdentity !== cleanOwner) {
        if (incomingConnectionIdArr.includes(dbConnectionId)) {
            console.log(`[Webhook-V7] Identity Mismatch (Owner: ${cleanOwner}, Config: ${dbIdentity}), but BYPASSING because Connection ID ${dbConnectionId} matched.`);
        } else {
            console.log(`[Webhook] Identity Mismatch. Payload Owner: ${cleanOwner}, Config Identity: ${dbIdentity}. Ignoring.`);
            return res.json({ status: 'ignored_wrong_identity' });
        }
    }

    // --- PROMP SHOWCHANNEL API VALIDATION (Root Isolation) ---
    // Definitively check if the receiving number (cleanOwner) actually belongs to the configured Channel
    // --- V8: BYPASS IF CONNECTION MATCHED ---
    if (cleanOwner && config && config.prompToken && config.prompConnectionId) {
        if (incomingConnectionIdArr.includes(dbConnectionId)) {
            console.log(`[Webhook-V8] Skipping showChannel validation because Connection ID ${dbConnectionId} already matched.`);
        } else {
            const cacheKey = `${config.prompToken}_${cleanOwner}`;

            // Read from Memory Cache
            if (validNumbersCache.has(cacheKey)) {
                const isValid = validNumbersCache.get(cacheKey);
                if (!isValid) {
                    console.log(`[Webhook] CACHE: Number ${cleanOwner} is known to be INVALID for connection ${config.prompConnectionId}. Ignoring.`);
                    return res.json({ status: 'ignored_invalid_channel_cache' });
                }
            } else {
                // Not in cache, call API to validate
                try {
                    const url = `${PROMP_BASE_URL}/v2/api/external/${config.prompToken}/showChannel`;
                    console.log(`[Webhook] Validating channel number ${cleanOwner} via API...`);

                    const resApi = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: cleanOwner })
                    });

                    if (resApi.ok) {
                        const data = await resApi.json();

                        // The API returns information about the channel with this number.
                        // We MUST ensure the returned channel matches our configured prompConnectionId.
                        const isMatch = (data.id && String(data.id).trim() === dbConnectionId) ||
                            (data.name && String(data.name).trim() === dbConnectionId) ||
                            (data.sessionName && String(data.sessionName).trim() === dbConnectionId) ||
                            (data.sessionId && String(data.sessionId).trim() === dbConnectionId);

                        if (isMatch) {
                            console.log(`[Webhook] API VALIDATION SUCCESS: Number ${cleanOwner} belongs to connection ${dbConnectionId}`);
                            validNumbersCache.set(cacheKey, true);
                        } else {
                            console.log(`[Webhook] API VALIDATION FAILED: Number ${cleanOwner} info (${data.id}/${data.name}) DOES NOT match Connection ID ${dbConnectionId}. Ignoring.`);
                            validNumbersCache.set(cacheKey, false);
                            return res.json({ status: 'ignored_invalid_channel_mismatch' });
                        }
                    } else {
                        console.log(`[Webhook] API VALIDATION FAILED: Number ${cleanOwner} not found in this tenant or error (Status: ${resApi.status}). Ignoring.`);
                        validNumbersCache.set(cacheKey, false);
                        return res.json({ status: 'ignored_invalid_channel_api' });
                    }
                } catch (e) {
                    console.error(`[Webhook] API VALIDATION ERROR for ${cleanOwner}:`, e.message);
                    // On request error, drop message for safety but don't cache as permanently invalid.
                    return res.json({ status: 'ignored_validation_error' });
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 5. STRICT FILTERS (Groups, Status, Broadcasts)
    // ------------------------------------------------------------------
    // COMPREHENSIVE GROUP DETECTION: Check ALL possible JID fields, not just rawSender.
    // In some payloads, rawSender resolves to the participant (individual number) while
    // the group JID (@g.us) is in another field. We must check everywhere.
    const groupIndicatorFields = [
        rawSender,
        payload.key?.remoteJid,
        payload.data?.key?.remoteJid,
        payload.msg?.from,
        payload.msg?.chatid,
        payload.msg?.chat,
        payload.msg?.remoteJid,
        payload.chatId,
        payload.chat?.id,
        payload.data?.chatId,
        payload.data?.from,
        payload.ticket?.chatId,
        payload.ticket?.remoteJid,
        payload.from,
    ].filter(Boolean).map(String);

    const groupFieldMatch = groupIndicatorFields.find(f => f.includes('@g.us'));
    const isGroup = !!groupFieldMatch;
    const isBroadcast = groupIndicatorFields.some(f => f.includes('broadcast') || f.includes('@lid'));

    // Check if messageType is present
    const messageType = payload.messageType || payload.type;
    const isProtocol = messageType === 'protocolMessage' || messageType === 'senderKeyDistributionMessage';

    if (groupIndicatorFields.some(f => f.includes('status@broadcast'))) {
        console.log('[Webhook] Ignoring Status Update (status@broadcast).');
        return res.json({ status: 'ignored_status' });
    }

    if (isGroup) {
        console.log(`[Webhook] Ignoring Group Message. Detected via field: "${groupFieldMatch}"`);
        return res.json({ status: 'ignored_group' });
    }

    if (isProtocol) {
        console.log('[Webhook] Ignoring Protocol Message.');
        return res.json({ status: 'ignored_protocol' });
    }

    let isFromMe = payload.key?.fromMe ||
        payload.fromMe ||
        payload.data?.key?.fromMe ||
        payload.msg?.fromMe ||
        payload.ticket?.fromMe; // Add n8n ticket check

    // ------------------------------------------------------------------
    // FLOW A: AGENT SENT MESSAGE -> START TIMER
    // ------------------------------------------------------------------

    if (isFromMe) {
        console.log('[Webhook] Message sent by Agent (fromMe). Starting Follow-up Timer.');

        let targetJid = payload.key?.remoteJid || payload.to || payload.msg?.chatid;

        if (targetJid) {
            const cleanTarget = String(targetJid).replace(/\D/g, '');

            // SAFETY CHECK: If Target is myself (Agent), ABORT.
            if (cleanTarget === cleanOwner || cleanTarget === dbIdentity || cleanTarget === cleanSender) {
                console.log(`[FollowUp] Timer SKIPPED. Target (${cleanTarget}) is myself/sender. (Owner: ${cleanOwner}, ID: ${dbIdentity})`);
                return res.json({ status: 'ignored_self_target' });
            }

            // Check if Follow-up is Enabled
            if (followUpCfg && followUpCfg.enabled && followUpCfg.attempts?.length > 0) {
                const firstAttempt = followUpCfg.attempts.find(a => a.active);
                if (!firstAttempt) {
                    console.log('[FollowUp] Timer IGNORED (No active attempts configured).');
                } else {
                    const now = new Date();
                    const nextDate = calculateNextDate(firstAttempt);

                    // UPSERT STATE for the USER (Target)
                    await prisma.contactState.upsert({
                        where: { companyId_remoteJid: { companyId, remoteJid: targetJid } },
                        create: {
                            companyId,
                            remoteJid: targetJid,
                            agentConfigId: agentId || config?.id || null,
                            isActive: true,
                            attemptIndex: 0,
                            lastOutbound: now,
                            nextFollowUp: nextDate
                        },
                        update: {
                            agentConfigId: agentId || config?.id || null,
                            isActive: true,
                            attemptIndex: 0,
                            lastOutbound: now,
                            nextFollowUp: nextDate
                        }
                    });
                    console.log(`[FollowUp] Timer STARTED for ${cleanTarget}. Next: ${nextDate.toISOString()}`);
                }
            } else {
                console.log('[FollowUp] Timer IGNORED (Disabled or No Attempts).');
            }
        }

        // CRITICAL: STOP HERE. Do not process as user message.
        return res.json({ status: 'agent_action_processed' });
    }

    // ------------------------------------------------------------------
    // FLOW B: USER SENT MESSAGE -> STOP TIMER & REPLY
    // ------------------------------------------------------------------

    console.log(`[Webhook] Processing User Message from ${cleanSender}...`);

    // Check if Ticket is Open (Human Attendance)
    // We ONLY ignore if status is explicitly 'open'. 
    // Statuses like 'pending', 'waiting', 'closed', or undefined should be processed by the AI if configured.
    console.log(`[Webhook] Ticket Info: ID=${payload.ticket?.id}, Status=${payload.ticket?.status}`);
    if (payload.ticket && String(payload.ticket.status).toLowerCase() === 'open') {
        console.log(`[Webhook] Ignoring Message from ${cleanSender}. Ticket is 'open' (Human Attendance).`);
        return res.json({ status: 'ignored_ticket_open' });
    }

    // Check if Status Update again (redundant but safe)
    if (payload.type === 'message_status' || (payload.status && typeof payload.status === 'string' && ['READ', 'ERROR', 'DELIVERY_ACK', 'SERVER_ACK', 'PLAYED'].includes(payload.status.toUpperCase()))) {
        console.log(`[Webhook] Ignoring Message Status Update from ${cleanSender}.`);
        return res.json({ status: 'ignored_status_update' });
    }

    // Ignore ACKs (Delivery/Read Receipts)
    if (payload.msg?.ack && payload.msg.ack > 1) {
        console.log(`[Webhook] Ignoring Message ACK (${payload.msg.ack}) from ${cleanSender}.`);
        return res.json({ status: 'ignored_ack' });
    }

    // Safety Check for Content
    let userMessage = payload.content?.text ||
        payload.text ||
        (typeof payload.body === 'string' ? payload.body : null) ||
        payload.body?.text ||
        payload.body?.content?.text ||
        payload.data?.message?.conversation ||
        payload.data?.message?.extendedTextMessage?.text ||
        payload.data?.text ||
        payload.message?.conversation ||
        payload.message?.extendedTextMessage?.text ||
        payload.message?.text ||
        payload.msg?.text ||
        payload.msg?.body ||
        payload.msg?.message ||
        payload.msg?.content;

    // 🔥 CRITICAL FIX: Ensure userMessage is always a STRING (never object)
    // Some payloads send payload.msg.content as object (e.g., reaction messages)
    // This causes OpenAI API error: "Invalid type for 'messages[1].content'"
    if (typeof userMessage !== 'string') {
        userMessage = typeof userMessage === 'object' && userMessage !== null
            ? (userMessage.text || userMessage.body || userMessage.conversation || '')
            : '';
    }

    // --- AUDIO HANDLING ---
    // If text is "ptt" (Push To Talk) or "audio" AND we have media, it's an Audio Message.
    let isAudioInput = false;
    let mediaBase64 = payload.content?.media || payload.msg?.media || payload.media; // Try all paths

    // Fix for PROMP/Uazapi payloads that send direct URL and mediaKey instead of base64
    if (!mediaBase64 && payload.msg?.messageType === 'AudioMessage' && payload.msg?.content?.URL && payload.msg?.content?.mediaKey) {
        console.log('[Webhook] Encrypted Audio Message Detected. Downloading and Decrypting...');
        mediaBase64 = await downloadAndDecryptWhatsAppMedia(payload.msg.content.URL, payload.msg.content.mediaKey, 'audio');
    }

    if ((userMessage === 'ptt' || userMessage === 'audio' || payload.type === 'audio' || payload.msg?.messageType === 'AudioMessage') && mediaBase64) {
        console.log('[Webhook] Audio Message Detected. Attempting Transcription...');

        // Need Global Key for Whisper
        const globalConfig = await prisma.globalConfig.findFirst();
        if (globalConfig?.openaiKey) {
            const transcription = await transcribeAudio(mediaBase64, globalConfig.openaiKey);
            if (transcription) {
                userMessage = `[ÁUDIO TRANSCRITO]: ${transcription}`;
                isAudioInput = true;
                console.log(`[Webhook] Audio Transcribed: "${userMessage}"`);
            } else {
                userMessage = "[Áudio inaudível]";
            }
        } else {
            console.warn('[Webhook] No Global OpenAI Key. Cannot transcribe audio.');
            userMessage = "[Áudio recebido, mas sem chave para transcrever]";
        }
    }

    // Detect media-only messages (file/image sent without caption) so conditional transfer
    // file collection fields can receive them even when there is no accompanying text.
    const mediaMessageTypes = ['ImageMessage', 'DocumentMessage', 'VideoMessage'];
    const hasMediaInPayload = !!(
        mediaMessageTypes.includes(payload.msg?.messageType) ||
        mediaMessageTypes.map(t => t.toLowerCase()).includes((payload.type || '').toLowerCase()) ||
        payload.msg?.content?.mimetype || payload.msg?.content?.mimeType ||
        payload.content?.mimetype || payload.content?.mimeType
    );

    if (!userMessage) {
        if (hasMediaInPayload) {
            userMessage = '[arquivo]';
        } else {
            console.log(`[Webhook] Payload from ${cleanSender} missing text content. Ignoring.`);
            return res.json({ status: 'ignored_no_text' });
        }
    }

    // Support both N8N structure (ticket.id), Wuzapi (wuzapi.id), and pure Promp structure
    const sessionId = payload.ticket?.id || payload.wuzapi?.id || (payload.classes && payload.classes.length > 0 ? payload.classes[0] : null) || null;
    const senderNumber = rawSender; // Reuse the already extracted and cleaned rawSender

    // Clean Sender Number
    const cleanNumber = senderNumber ? String(senderNumber).replace(/\D/g, '') : null;

    if (!cleanNumber) {
        console.log(`[Webhook] No specific sender number found for ${cleanSender}. Ignoring.`);
        return res.json({ status: 'ignored_no_number' });
    }

    // --- STOP FOLLOW-UP TIMER (User Replied) ---
    try {
        const jid = senderNumber.includes('@') ? senderNumber : `${senderNumber}@s.whatsapp.net`;
        await prisma.contactState.updateMany({
            where: {
                companyId: companyId,
                remoteJid: jid
            },
            data: { isActive: false }
        });
        console.log(`[FollowUp] Timer STOPPED for ${cleanNumber}`);
    } catch (e) {
        // Ignore error
    }

    // --- CRM: record inbound message to conversation history ---
    appendConversationHistory(prisma, companyId, cleanNumber, 'user', userMessage).catch(() => {});

    // --- EMOJI REACTION (fire-and-forget, before AI processing) ---
    if (config && msgId) {
        // Inject Uazapi token from webhook payload if agent config doesn't have one
        const webhookUazapiToken = payload.ticket?.whatsapp?.tokenAPI;
        if (webhookUazapiToken && !getUazapiConfig(config)) {
            if (!config.integrations) config.integrations = {};
            if (!config.integrations.whatsapp) config.integrations.whatsapp = {};
            config.integrations.whatsapp.tokenAPI = webhookUazapiToken;
            console.log(`[Reaction] Injected Uazapi token from webhook payload: ${webhookUazapiToken.substring(0, 8)}...`);
        }
        reactToUserMessage(config, cleanNumber, msgId, userMessage);
    }

    let metadata = "{}";
    try {
        metadata = JSON.stringify(payload);
    } catch (e) {
        console.warn(`[Webhook] Warning: payload circular structure prevented stringification for ${cleanNumber}. Using empty metadata.`);
    }

    try {
        if (!config) {
            console.log(`[Webhook] Company config not found for ID: ${companyId}`);
            return res.status(404).json({ error: 'Company config not found. Check ID.' });
        }

        const msgLog = userMessage ? String(userMessage).substring(0, 50) : '[No Content]';
        console.log(`[Webhook] Processing message for ${cleanNumber}: "${msgLog}..."`);

        // Fetch History
        let history = [];
        const dbSessionId = cleanNumber || sessionId || 'unknown_session';

        if (cleanNumber) {
            try {
                // 2. Fetch History: Get 20 *MOST RECENT* messages (descending)
                // SCOPED BY OWNER (Bot Number) if known
                const whereClause = {
                    companyId: String(companyId),
                    sessionId: String(dbSessionId)
                };

                // If we know the bot identity (either from config or payload), use it to filter history
                // This prevents AI from seeing messages from other bots on the same account
                const currentOwner = dbIdentity || cleanOwner;
                if (currentOwner) {
                    whereClause.owner = currentOwner;
                }

                const storedMessages = await prisma.testMessage.findMany({
                    where: whereClause,
                    orderBy: { createdAt: 'desc' }, // Get newest first
                    take: 20
                });

                // 3. Reverse to Chronological Order for OpenAI (Oldest -> Newest)
                history = storedMessages.reverse().map(m => ({
                    role: m.sender === 'user' ? 'user' : 'assistant',
                    content: m.text
                }));

                console.log(`[Webhook] Fetched ${history.length} msgs of Persistent History for ${dbSessionId}`);
            } catch (histError) {
                console.error('[Webhook] History Fetch Error:', histError);
            }
        }

        // Fetch Tag Triggers for Autotagging
        let tagTriggers = [];
        try {
            tagTriggers = await prisma.tagTrigger.findMany({
                where: { companyId: String(companyId), isActive: true }
            });
        } catch (err) {
            console.error('[Webhook] Failed to fetch tag triggers:', err);
        }

        const currentTicketId = payload.ticket?.id || null;

        // --- CHECK ACTIVE CONDITIONAL TRANSFER SESSION ---
        try {
            const activeSession = await prisma.transferSession.findFirst({
                where: {
                    companyId: String(companyId),
                    sessionId: String(cleanNumber),
                    status: 'collecting'
                },
                orderBy: { startedAt: 'desc' }
            });

            if (activeSession) {
                console.log(`[Webhook] Active Conditional Transfer Session found for ${cleanNumber}`);

                // Get the rule config from transferConfig
                let allTransferConfigs = config.transferConfig;
                if (allTransferConfigs && !Array.isArray(allTransferConfigs)) allTransferConfigs = [allTransferConfigs];

                const conditionalRules = (allTransferConfigs || []).filter(r => r.mode === 'conditional');
                const rule = conditionalRules[activeSession.flowConfigIndex];

                if (rule) {
                    // --- ROBUST MEDIA EXTRACTION ---
                    let mediaPayload = null;
                    
                    const findMediaRecursively = (obj) => {
                        if (!obj || typeof obj !== 'object') return null;
                        
                        // Check if current level has media indicators
                        const hasUrl = obj.url || obj.URL || obj.directPath;
                        const hasMime = obj.mimetype || obj.mimeType || obj.contentType;
                        
                        if (hasUrl && hasMime) {
                            return {
                                id: obj.id || obj.fileSha256 || `media_${Date.now()}`,
                                mediaId: obj.id || obj.fileSha256,
                                mimeType: String(hasMime).toLowerCase(),
                                fileName: obj.fileName || obj.filename || obj.caption || 'arquivo',
                                size: obj.fileLength || obj.size || 0,
                                url: hasUrl
                            };
                        }
                        
                        // Recurse into common message keys
                        const keysToTry = ['documentMessage', 'imageMessage', 'audioMessage', 'videoMessage', 'stickerMessage', 'msg', 'message', 'content', 'body'];
                        for (const key of keysToTry) {
                            if (obj[key]) {
                                const found = findMediaRecursively(obj[key]);
                                if (found) return found;
                            }
                        }
                        
                        // Generic deep search
                        for (const key of Object.keys(obj)) {
                            if (keysToTry.includes(key)) continue; // Already tried
                            if (obj[key] && typeof obj[key] === 'object') {
                                const found = findMediaRecursively(obj[key]);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    mediaPayload = findMediaRecursively(payload);
                    
                    if (mediaPayload) {
                        console.log(`[ConditionalTransfer] Media detected: ${mediaPayload.fileName} (${mediaPayload.mimeType})`);
                    } else {
                        // Fallback log for debugging
                        const msgType = (payload.msg?.messageType || payload.type || '').toLowerCase();
                        if (msgType.includes('message') || msgType.includes('image') || msgType.includes('document')) {
                            console.log(`[ConditionalTransfer] Payload type "${msgType}" suggested media, but extraction failed.`);
                        }
                    }

                    const result = handleCollectionStep(rule, activeSession, userMessage, mediaPayload);

                    // Simulated typing delay (500-1500ms)
                    const typingDelay = 500 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, typingDelay));

                    switch (result.action) {
                        case 'ask': {
                            // Update session and send next question
                            await prisma.transferSession.update({
                                where: { id: activeSession.id },
                                data: {
                                    currentFieldIndex: result.nextFieldIndex,
                                    retriesOnCurrentField: 0,
                                    collectedData: JSON.stringify(result.collectedData),
                                    attachments: JSON.stringify(result.attachments)
                                }
                            });
                            await sendPrompMessage(config, cleanNumber, result.message, null, null, null);
                            return res.json({ status: 'conditional_transfer_collecting' });
                        }

                        case 'retry': {
                            await prisma.transferSession.update({
                                where: { id: activeSession.id },
                                data: { retriesOnCurrentField: result.retries }
                            });
                            await sendPrompMessage(config, cleanNumber, result.message, null, null, null);
                            return res.json({ status: 'conditional_transfer_retry' });
                        }

                        case 'cancelled': {
                            await prisma.transferSession.update({
                                where: { id: activeSession.id },
                                data: { status: 'cancelled', completedAt: new Date() }
                            });
                            await sendPrompMessage(config, cleanNumber, result.message, null, null, null);
                            return res.json({ status: 'conditional_transfer_cancelled' });
                        }

                        case 'failed': {
                            await prisma.transferSession.update({
                                where: { id: activeSession.id },
                                data: { status: 'failed', completedAt: new Date(), failureReason: result.reason }
                            });
                            await sendPrompMessage(config, cleanNumber, result.message, null, null, null);
                            return res.json({ status: 'conditional_transfer_failed' });
                        }

                        case 'complete': {
                            const transferId = generateTransferId();

                            // Update session as completed
                            await prisma.transferSession.update({
                                where: { id: activeSession.id },
                                data: {
                                    status: 'completed',
                                    completedAt: new Date(),
                                    collectedData: JSON.stringify(result.collectedData),
                                    attachments: JSON.stringify(result.attachments),
                                    transferId
                                }
                            });

                            // 1. Render notification template and send to WhatsApp
                            if (rule.notificationWhatsApp?.number && rule.notificationWhatsApp?.messageTemplate) {
                                const notifNumber = rule.notificationWhatsApp.number.replace(/\D/g, '');
                                const renderedMsg = renderTemplate(
                                    rule.notificationWhatsApp.messageTemplate,
                                    result.collectedData,
                                    rule.fields
                                );
                                const fullMsg = `📋 *Encaminhamento Condicional* (${transferId})\n\n${renderedMsg}`;
                                await sendPrompMessage(config, notifNumber, fullMsg, null, null, null);

                                // Forward Attachments to Operator
                                if (result.attachments && result.attachments.length > 0) {
                                    console.log(`[ConditionalTransfer] Forwarding ${result.attachments.length} attachments to operator ${notifNumber}...`);
                                    for (const att of result.attachments) {
                                        try {
                                            if (att.url) {
                                                // Baixar e encaminhar o arquivo real
                                                const axios = (await import('axios')).default;
                                                const response = await axios.get(att.url, { responseType: 'arraybuffer' });
                                                const buffer = Buffer.from(response.data);
                                                
                                                const { sendPrompMedia } = await import('./prompUtils.js');
                                                await sendPrompMedia(config, notifNumber, buffer, att.fileName || 'arquivo', att.mimeType, `Anexo de: ${att.fieldId}`);
                                            } else {
                                                console.log(`[ConditionalTransfer] Attachment ${att.fieldId} has no URL to forward.`);
                                            }
                                        } catch (forwardErr) {
                                            console.error(`[ConditionalTransfer] Failed to forward attachment ${att.fieldId}:`, forwardErr.message);
                                        }
                                    }
                                }
                                console.log(`[ConditionalTransfer] Summary sent to ${notifNumber}`);
                            }

                            // 2. Create ticket note with collected data
                            if (currentTicketId) {
                                const noteContent = `Encaminhamento Condicional (${transferId})\n\nDados coletados:\n${Object.entries(result.collectedData).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
                                await createTicketNote(config, currentTicketId, noteContent);
                            }

                            // 3. Execute transfer
                            if (currentTicketId && rule.destination) {
                                const updateData = { status: 'open' };
                                if (rule.destination.type === 'user' && rule.destination.targetId) {
                                    updateData.userId = Number(rule.destination.targetId);
                                } else if (rule.destination.type === 'queue' && rule.destination.targetId) {
                                    updateData.queueId = Number(rule.destination.targetId);
                                }
                                await setTicketInfo(config, currentTicketId, updateData);
                            }

                            // 4. Confirm to user
                            const confirmMsg = `✅ Informações recebidas! Estou transferindo seu atendimento. Protocolo: *${transferId}*. Por favor, aguarde.`;
                            await sendPrompMessage(config, cleanNumber, confirmMsg, null, null, null);

                            console.log(`[ConditionalTransfer] COMPLETED for ${cleanNumber}. Transfer ID: ${transferId}`);
                            return res.json({ status: 'conditional_transfer_completed', transferId });
                        }
                    }
                } else {
                    // Rule not found — cancel orphan session
                    console.warn(`[ConditionalTransfer] Rule index ${activeSession.flowConfigIndex} not found. Cancelling session.`);
                    await prisma.transferSession.update({
                        where: { id: activeSession.id },
                        data: { status: 'failed', completedAt: new Date(), failureReason: 'Rule config not found' }
                    });
                }
            }
        } catch (ctErr) {
            console.error('[Webhook] Conditional Transfer Session Error:', ctErr);
        }

        // If the message was a media-only payload (no caption) and wasn't consumed by an
        // active ConditionalTransfer session, don't forward the placeholder to the AI.
        if (userMessage === '[arquivo]') {
            console.log(`[Webhook] Media-only message from ${cleanNumber} not consumed by transfer session. Ignoring.`);
            return res.json({ status: 'ignored_media_no_session' });
        }

        let transferConfigs = config?.transferConfig;
        if (transferConfigs && !Array.isArray(transferConfigs)) {
            transferConfigs = [transferConfigs];
        } else if (!transferConfigs) {
            transferConfigs = [];
        }

        const logWebhook = (m) => {
            try { fsCommon.appendFileSync('debug_transfer.txt', `[${new Date().toISOString()}] ${m}\n`); } catch(e) {}
            console.log(m);
        };

        if (userMessage) {
            logWebhook(`[Webhook] Processing msg: "${userMessage.substring(0, 30)}" for Agent: ${agentId || 'Global'}. Rules found: ${transferConfigs.length}`);
            
            let matched = false;

            // --- CONDITIONAL TRANSFER: Check conditional rules FIRST ---
            const conditionalRules = transferConfigs.filter(r => r.mode === 'conditional');
            
            for (let ci = 0; ci < conditionalRules.length; ci++) {
                const rule = conditionalRules[ci];
                const isMatch = shouldTriggerConditionalTransfer(userMessage, rule);
                
                if (isMatch) {
                    logWebhook(`[Webhook] Conditional Transfer Trigger MATCHED for rule: "${rule.name || ci}" (Trigger: ${rule.triggerMode})`);

                    // Find the actual index in the full conditional array
                    const allConditional = transferConfigs.filter(r => r.mode === 'conditional');
                    const flowConfigIndex = ci;

                    try {
                        // Create a new collection session
                        const session = await prisma.transferSession.create({
                            data: {
                                companyId: String(companyId),
                                sessionId: String(cleanNumber),
                                agentConfigId: config.id || 'unknown',
                                flowConfigIndex,
                                status: 'collecting',
                                collectedData: '{}',
                                attachments: '[]',
                                currentFieldIndex: 0,
                                retriesOnCurrentField: 0
                            }
                        });

                        console.log(`[ConditionalTransfer] Session created: ${session.id}`);

                        // Send intro + first question
                        const { intro, question, fieldIndex } = getInitialMessages(rule);

                        // Update session with actual first field index
                        if (fieldIndex > 0) {
                            await prisma.transferSession.update({
                                where: { id: session.id },
                                data: { currentFieldIndex: fieldIndex }
                            });
                        }

                        // Simulated typing delay
                        const typingDelay = 500 + Math.random() * 1000;
                        await new Promise(resolve => setTimeout(resolve, typingDelay));

                        if (intro) {
                            await sendPrompMessage(config, cleanNumber, intro, null, null, null);
                            // Small gap between intro and question
                            await new Promise(resolve => setTimeout(resolve, 800));
                        }

                        if (question) {
                            await sendPrompMessage(config, cleanNumber, question, null, null, null);
                        }

                        return res.json({ status: 'conditional_transfer_started' });
                    } catch (ctCreateErr) {
                        console.error('[Webhook] Failed to create conditional transfer session:', ctCreateErr);
                    }
                }
            }

            // --- SIMPLE TRANSFER: Check simple rules ---
            for (const rule of transferConfigs) {
                if (rule.mode === 'conditional') continue; // Skip conditional rules (already checked above)
                if (!rule.triggerText) continue;
                const trigger = rule.triggerText.toLowerCase().trim();
                const msg = userMessage.toLowerCase().trim();
                
                if (msg.includes(trigger)) {
                    console.log(`[Webhook] Transfer Trigger MATCHED: "${trigger}"`);
                    matched = true;
                    
                    if (currentTicketId) {
                        try {
                            const globalConfig = await getGlobalConfig();
                            const openaiKey = globalConfig?.openaiKey || process.env.OPENAI_API_KEY;
                            
                            let summary = "Resumo indisponível (Erro na API).";
                            
                            if (openaiKey) {
                                const openai = new OpenAI({ apiKey: openaiKey });
                                
                                const summaryMessages = history.map(m => ({
                                    role: m.role,
                                    content: m.content
                                }));
                                
                                summaryMessages.push({ role: 'user', content: userMessage });
                                summaryMessages.push({
                                    role: 'system',
                                    content: `Você é um assistente de atendimento. Um cliente acionou a transferência para um humano.
**RESUMA A CONVERSA** acima em até 1 parágrafo curto para o atendente ler. 
Foque no PROBLEMA ou DÚVIDA do cliente e o que foi resolvido até agora.
NÃO fale com o cliente. Responda APENAS com o resumo.`
                                });
                                
                                console.log('[Webhook] Generating conversation summary...');
                                const summaryResponse = await openai.chat.completions.create({
                                    model: 'gpt-4o-mini',
                                    messages: summaryMessages,
                                    max_tokens: 300
                                });
                                
                                summary = summaryResponse.choices[0]?.message?.content || "Resumo não gerado.";
                            }
                            
                            // 2. Create Note
                            await createTicketNote(config, currentTicketId, `Resumo da IA: ${summary}`);
                            
                            // 3. Update Ticket Info
                            const updateData = { status: 'open' };
                            if (rule.targetType === 'user' && rule.targetId) {
                                updateData.userId = Number(rule.targetId);
                            } else if (rule.targetType === 'queue' && rule.targetId) {
                                updateData.queueId = Number(rule.targetId);
                            }
                            
                            await setTicketInfo(config, currentTicketId, updateData);
                            
                            // Reply to client about transfer
                            const feedbackMsg = "Estou transferindo seu atendimento para um de nossos especialistas. Por favor, aguarde um momento.";
                            await sendPrompMessage(config, cleanNumber, feedbackMsg, null, null, null);
                            
                            return res.json({ status: 'transferred' });
                        } catch (err) {
                            console.error('[Webhook] Transfer Error:', err);
                        }
                    }
                    break; // Sai do loop para não processar múltiplos matchings numa mesma mensagem
                }
            }
        }

        // 3. Process AI Response
        // Pass isAudioInput flag so AI can decide to reply with audio
        const chatResults = await processChatResponse(config, userMessage, history, dbSessionId, isAudioInput, currentTicketId, tagTriggers);
        let { aiResponse, audioBase64, productImageUrl, productCaption, pdfBase64, messageChunks, calledCatalog } = chatResults;

        // --- CATALOG SUPPRESSION ---
        // When AI called list_available_products OR keyword matches, replace the AI text response with
        // a brief intro. The carousel delivers the product list — no need for AI to also list in text.
        const isCatalogRequest = calledCatalog || shouldShowCatalog(userMessage);
        if (isCatalogRequest) {
            console.log(`[Webhook] Catalog intent (calledCatalog=${calledCatalog}). Replacing AI response with carousel intro.`);
            aiResponse = 'Claro! Aqui estão nossos produtos disponíveis 👇';
            messageChunks = [{ type: 'text', content: aiResponse }];
            chatResults.messageChunks = messageChunks;
            productImageUrl = null;
            productCaption = null;
            audioBase64 = null;
        }

        // Evaluate CRM Opportunity Creation (Non-blocking)
        const crmContactName = payload.contact?.name || payload.ticket?.contact?.name ||
            payload.msg?.pushName || payload.data?.pushName || payload.pushName ||
            payload.sender?.name || cleanNumber || 'Contato';
        evaluateOpportunityCreation(
            prisma,
            config.prompUuid,
            config.prompToken,
            currentTicketId,
            crmContactName,
            cleanNumber,
            [...history, { role: 'user', content: userMessage }, { role: 'assistant', content: aiResponse }],
            companyId
        ).catch(e => console.error('[CRM Entry] Error in evaluateOpportunityCreation:', e));

        // Persist Chat
        const finalOwner = dbIdentity || cleanOwner;
        try {
            await prisma.testMessage.create({
                data: {
                    companyId: String(companyId),
                    sender: 'user',
                    text: userMessage,
                    sessionId: String(dbSessionId),
                    owner: finalOwner, // Save owner
                    metadata
                }
            });
            await prisma.testMessage.create({
                data: {
                    companyId: String(companyId),
                    sender: 'ai',
                    text: aiResponse,
                    sessionId: String(dbSessionId),
                    owner: finalOwner // Save owner
                }
            });
        } catch (dbError) {
            console.error('[Webhook] Failed to save chat:', dbError);
        }

        // --- REPLY STRATEGY ---
        let sentViaApi = false;
        if (config.prompUuid && config.prompToken) {

            // MULTI-MESSAGE SENDING LOOP
            if (messageChunks && messageChunks.length > 0) {
                console.log(`[Webhook] === MULTI-CHUNK SEND: ${messageChunks.length} chunks ===`);
                messageChunks.forEach((c, i) => console.log(`[Webhook]   Chunk[${i}]: type=${c.type}${c.type==='image'?' url='+c.url?.substring(0,60):''}${c.type==='text'?' text='+c.content?.substring(0,60):''}`));

                // PRE-PROCESS: Merge text+image pairs so the text becomes the image caption.
                // This reduces API calls and avoids rate-limiting when sending multiple images.
                const mergedChunks = [];
                let i = 0;
                while (i < messageChunks.length) {
                    const current = messageChunks[i];
                    const next = messageChunks[i + 1];

                    if (current.type === 'text' && next && next.type === 'image') {
                        // Merge: text becomes caption of the next image
                        mergedChunks.push({
                            type: 'image',
                            url: next.url,
                            caption: current.content, // Use the preceding text as the caption
                            id: next.id
                        });
                        i += 2; // Skip both
                    } else {
                        mergedChunks.push(current);
                        i++;
                    }
                }

                console.log(`[Webhook] After merge: ${mergedChunks.length} chunks to send.`);

                for (const [index, chunk] of mergedChunks.entries()) {
                    console.log(`[Webhook] Sending chunk[${index}]: type=${chunk.type}`);

                    if (chunk.type === 'image') {
                        console.log(`[Webhook]   -> Image URL: ${chunk.url?.substring(0, 80)}`);
                        console.log(`[Webhook]   -> Caption: ${chunk.caption?.substring(0, 60)}`);
                        try {
                            await sendPrompMessage(config, cleanNumber, null, null, chunk.url, chunk.caption);
                            console.log(`[Webhook]   -> Image chunk[${index}] SENT OK`);
                        } catch (imgErr) {
                            console.error(`[Webhook]   -> Image chunk[${index}] FAILED:`, imgErr.message);
                        }
                        // Larger delay between images to avoid API rate-limiting
                        await new Promise(r => setTimeout(r, 1500));

                    } else if (chunk.type === 'text') {
                        const chunkAudio = (index === 0) ? audioBase64 : null;

                        // PRESENCE SIMULATION (Typing/Recording)
                        // Use Uazapi presence if configured, otherwise fall back to Promp presence
                        const uazapiCfg = getUazapiConfig(config);
                        if (uazapiCfg) {
                            const presenceType = chunkAudio ? 'audio' : 'text';
                            const presenceContent = chunkAudio ? 10 : (chunk.content || '');
                            await sendPresenceAndWait(uazapiCfg.tokenAPI, cleanNumber, presenceContent, presenceType);
                        } else if (currentTicketId) {
                            const state = chunkAudio ? 'recording' : 'typing';
                            const charCount = chunk.content ? chunk.content.length : 0;
                            const baseDelay = chunkAudio ? 3500 : Math.min(Math.max(charCount * 30, 1000), 4500);

                            await sendPrompPresence(config, currentTicketId, state);
                            await new Promise(r => setTimeout(r, baseDelay));
                            await sendPrompPresence(config, currentTicketId, 'paused');
                        }

                        const textToSend = chunkAudio ? null : chunk.content;
                        try {
                            let chunkSent = false;
                            
                            // SE houver áudio e Uazapi configurado, envia via Uazapi (PTT)
                            if (chunkAudio && uazapiCfg) {
                                console.log(`[Webhook]   -> Sending audio chunk via Uazapi PTT (Total Silence for Text)...`);
                                chunkSent = await sendUazapiAudio(uazapiCfg.tokenAPI, cleanNumber, chunkAudio);
                                // Se enviou áudio, o sendPrompMessage posterior não deve enviar NADA para este chunk
                                if (chunkSent) {
                                    console.log(`[Webhook]   -> Audio chunk[${index}] SENT via Uazapi OK. Skipping text to avoid caption/shared format.`);
                                    // Não chamamos sendPrompMessage aqui para evitar duplicidade ou legendas
                                }
                            }

                            if (!chunkSent) {
                                console.log(`[Webhook]   -> Sending via Promp fallback (Text exists: ${!!textToSend})`);
                                await sendPrompMessage(config, cleanNumber, textToSend, chunkAudio, null, null);
                                console.log(`[Webhook]   -> chunk[${index}] processed via Promp.`);
                            }
                        } catch (txtErr) {
                            console.error(`[Webhook]   -> chunk[${index}] FAILED:`, txtErr.message);
                        }
                        await new Promise(r => setTimeout(r, 800));
                    }
                }
                sentViaApi = true;

            } else {
                // FALLBACK FOR SINGLE MESSAGE CALL
                // Use Uazapi presence if configured, otherwise fall back to Promp presence
                const uazapiCfgSingle = getUazapiConfig(config);
                if (uazapiCfgSingle && (aiResponse || audioBase64)) {
                    const presenceType = audioBase64 ? 'audio' : 'text';
                    const presenceContent = audioBase64 ? 10 : (aiResponse || '');
                    await sendPresenceAndWait(uazapiCfgSingle.tokenAPI, cleanNumber, presenceContent, presenceType);
                } else if (currentTicketId && (aiResponse || audioBase64)) {
                    const state = audioBase64 ? 'recording' : 'typing';
                    const charCount = aiResponse ? aiResponse.length : 0;
                    const baseDelay = audioBase64 ? 3500 : Math.min(Math.max(charCount * 30, 1000), 4500);

                    await sendPrompPresence(config, currentTicketId, state);
                    await new Promise(r => setTimeout(r, baseDelay));
                    await sendPrompPresence(config, currentTicketId, 'paused');
                }

                // Se tiver áudio gerado, enviamos APENAS o áudio para evitar texto duplicado
                const textToSend = audioBase64 ? null : aiResponse;
                
                let singleSent = false;
                if (audioBase64 && uazapiCfgSingle) {
                    console.log(`[Webhook] Sending focus audio via Uazapi PTT (No Caption mode)...`);
                    singleSent = await sendUazapiAudio(uazapiCfgSingle.tokenAPI, cleanNumber, audioBase64);
                    if (singleSent) {
                        console.log(`[Webhook] Audio SENT via Uazapi. Now sending text/media separately if needed.`);
                        // Envia o texto (se houver) separadamente pois o ptt enviou o áudio
                        await sendPrompMessage(config, cleanNumber, textToSend, null, productImageUrl, productCaption, pdfBase64);
                        sentViaApi = true;
                    }
                }

                if (!singleSent) {
                    console.log(`[Webhook] Falling back to Promp API for audio/text. Uazapi available: ${!!uazapiCfgSingle}`);
                    sentViaApi = await sendPrompMessage(config, cleanNumber, textToSend, audioBase64, productImageUrl, productCaption, pdfBase64);
                }
            }

            console.log(`[Webhook] Sent via API: ${sentViaApi}`);
        } else {
            console.log('[Webhook] Config missing prompUuid/Token. Falling back to JSON response.');
        }

        // --- CATALOG CAROUSEL (Interactive WhatsApp Carousel) ---
        // After sending the AI response, check if the user wants to see the catalog
        // and send a WhatsApp carousel via Uazapi (POST /send/carousel)
        try {
            if (isCatalogRequest) {
                // Only show physical products in carousel — exclude services
                const allProducts = Array.isArray(config.products) ? config.products : [];
                const catalogProducts = allProducts.filter(p => p.type !== 'service');
                if (catalogProducts.length > 0) {
                    const uazapiCfgCatalog = getUazapiConfig(config);
                    if (uazapiCfgCatalog) {
                        console.log(`[Webhook] Catalog intent: ${allProducts.length} total, ${catalogProducts.length} products (${allProducts.length - catalogProducts.length} services filtered).`);
                        catalogProducts.forEach(p => {
                            const img = p.imageUrl || p.image || p.imagem || p.foto || null;
                            const imgType = img
                                ? (img.startsWith('data:') ? 'BASE64' : img.startsWith('http') ? 'URL' : 'UNKNOWN')
                                : 'NONE';
                            console.log(`[Carousel] Product "${p.name || p.title}" — image type: ${imgType} | value: ${img ? img.substring(0, 100) : 'NONE'}`);
                        });
                        await new Promise(r => setTimeout(r, 1500));
                        await sendCatalogCarousel(uazapiCfgCatalog.tokenAPI, cleanNumber, catalogProducts, config.name, cleanOwner);
                    } else {
                        console.log('[Webhook] Catalog intent detected but no Uazapi/Promp credentials available.');
                    }
                } else {
                    console.log('[Webhook] Catalog intent detected but no products available (after filtering services).');
                }
            }
        } catch (catalogErr) {
            // Catalog is non-critical — never block the response
            console.error('[Webhook] Carousel Error (non-blocking):', catalogErr.message);
        }

        if (sentViaApi) {
            res.json({ status: 'sent_via_api' });
        } else {
            res.json({
                text: aiResponse,
                audio: audioBase64,
                image: productImageUrl,
                sessionId: sessionId
            });
        }

    } catch (error) {
        console.error('[Webhook] Error:', error);
        res.status(500).json({ error: error.message || 'Processing failed' });
    }
};

app.post('/webhook/:companyId', handleWebhookRequest);
app.post('/api/webhook/:companyId', handleWebhookRequest);
app.post('/api/promp/webhook/:companyId', handleWebhookRequest);

// ... (Rest of index.js continues)

// ... (Keep existing code)

// --- PRODUCT EXTRACTION ROUTES ---

// 1. Manual Extraction Test
app.post('/api/products/extract', authenticateToken, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        if (!url) return res.status(400).json({ error: 'URL is required' });

        // Retrieve API Key from DB (Agent Config or Global)
        let apiKey = process.env.OPENAI_API_KEY;
        const companyId = req.user?.companyId;

        if (companyId) {
            const config = await prisma.agentConfig.findFirst({
                where: { companyId },
                select: { integrations: true }
            });
            if (config && config.integrations) {
                try {
                    const integrations = typeof config.integrations === 'string'
                        ? JSON.parse(config.integrations)
                        : config.integrations;

                    if (integrations.openaiKey) apiKey = integrations.openaiKey;
                } catch (e) {
                    console.error('[Extract API] Error parsing integrations:', e);
                }
            }
        }

        // Fallback to Global Config if still no key
        if (!apiKey) {
            const globalConfig = await prisma.globalConfig.findFirst();
            if (globalConfig?.openaiKey) apiKey = globalConfig.openaiKey;
        }

        const products = await extractFromUrl(url, apiKey);
        res.json({ success: true, products });
    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to extract products' });
    }
});

// 2. Add/Update Product Source (Schedule)
app.post('/api/products/sources', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { url, type, frequency } = req.body;

        // Simple create for now
        const source = await prisma.productSource.create({
            data: {
                companyId,
                type: type || 'URL',
                url,
                frequency: frequency || 'daily',
                status: 'active',
                nextRun: new Date() // Run immediately or soon
            }
        });

        res.json({ success: true, source });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. List Sources
app.get('/api/products/sources', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const sources = await prisma.productSource.findMany({
            where: { companyId }
        });
        res.json(sources);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Delete Source
app.delete('/api/products/sources/:id', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { id } = req.params;
        await prisma.productSource.deleteMany({ // deleteMany for safety (ensure ownership)
            where: { id, companyId }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- INTEGRATIONS: WBUY ---
app.post('/api/integrations/wbuy/sync', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.companyId;

        // 1. Fetch current config
        const config = await prisma.agentConfig.findFirst({ where: { companyId } });

        if (!config || !config.integrations) {
            return res.status(400).json({ success: false, message: 'Nenhuma integração configurada.' });
        }

        const integrations = JSON.parse(config.integrations);
        const wbuyConfig = integrations.wbuy;

        if (!wbuyConfig || !wbuyConfig.enabled || !wbuyConfig.apiUser || !wbuyConfig.apiPassword) {
            return res.status(400).json({ success: false, message: 'A integração com a Wbuy não está ativa ou faltam credenciais.' });
        }

        // 2. Auth for Wbuy
        const authStr = `${wbuyConfig.apiUser}:${wbuyConfig.apiPassword}`;
        const base64Auth = Buffer.from(authStr).toString('base64');
        const headers = {
            'Authorization': `Bearer ${base64Auth}`,
            'User-Agent': `PrompIA (suporte@promp.com.br)`,
            'Content-Type': 'application/json'
        };

        // 2.5 Fetch Categories from Wbuy
        let wbuyCatMap = new Map(); // Map wbuyId -> internalCategoryId
        let updatedCategoriesList = [];

        try {
            const catRes = await fetch('https://sistema.sistemawbuy.com.br/api/v1/category', { headers });
            if (catRes.ok) {
                const catData = await catRes.json();
                const rawCategories = catData.data || catData;

                if (Array.isArray(rawCategories)) {
                    const existingCategories = config.categories ? JSON.parse(config.categories) : [];
                    let catMap = new Map(); // name -> cat
                    
                    existingCategories.forEach(c => {
                        catMap.set(c.name.trim().toLowerCase(), c);
                        if (c.wbuyId) wbuyCatMap.set(String(c.wbuyId), c.id);
                    });

                    rawCategories.forEach(wc => {
                        const catName = wc.nome || wc.name;
                        if (!catName) return;

                        const wcatId = String(wc.id);
                        const existingCat = catMap.get(catName.trim().toLowerCase());

                        if (existingCat) {
                            // Update wbuyId if missing
                            existingCat.wbuyId = wcatId;
                            wbuyCatMap.set(wcatId, existingCat.id);
                        } else {
                            // Create New
                            const newCat = {
                                id: `cat_wbuy_${wcatId}_${Date.now()}`,
                                name: catName.trim(),
                                wbuyId: wcatId
                            };
                            existingCategories.push(newCat);
                            wbuyCatMap.set(wcatId, newCat.id);
                            catMap.set(catName.trim().toLowerCase(), newCat);
                        }
                    });

                    updatedCategoriesList = existingCategories;
                }
            }
        } catch (catError) {
            console.error('Erro ao buscar categorias Wbuy:', catError);
            // Non-blocking: continue to products
        }

        // 3. Fetch Products from Wbuy
        const wbuyRes = await fetch('https://sistema.sistemawbuy.com.br/api/v1/product', { headers });

        if (!wbuyRes.ok) {
            console.error(`Status HTTP Wbuy: ${wbuyRes.status}`);
            return res.status(500).json({ success: false, message: `Erro ao comunicar com API da Wbuy (Status ${wbuyRes.status}). Verifique as credenciais.` });
        }

        const wbuyData = await wbuyRes.json();
        let rawProducts = wbuyData.data || wbuyData;

        if (!Array.isArray(rawProducts)) {
            return res.status(500).json({ success: false, message: 'Formato de resposta inesperado da Wbuy.' });
        }

        // 4. Transform to Promp Format
        let productsMap = new Map();
        const existingProducts = config.products ? JSON.parse(config.products) : [];
        existingProducts.forEach(p => {
            productsMap.set(p.name.trim().toLowerCase(), p);
        });

        rawProducts.forEach(wp => {
            const productName = wp.produto || 'Produto Wbuy';
            const wbuyId = String(wp.id);
            const wbuyUrl = wp.url_relative || '';
            const existing = productsMap.get(productName.trim().toLowerCase());

            // Check details
            const hasVariations = Array.isArray(wp.estoque) && wp.estoque.length > 0;
            const stock = parseFloat(wp.quantidade_total_em_estoque) || 0;

            let price = 0;
            if (hasVariations && wp.estoque[0].valores && wp.estoque[0].valores.length > 0) {
                price = parseFloat(wp.estoque[0].valores[0].valor) || 0;
            }

            const paymentLink = wbuyUrl;

            // --- CATEGORY LINKING ---
            let categoryId = existing ? existing.categoryId : null;
            
            // Tentativas de ler ID da categoria da Wbuy
            const wbuyCategoryId = wp.id_categoria || wp.categoria_id || wp.id_subcategoria; 
            
            if (wbuyCategoryId && wbuyCatMap.has(String(wbuyCategoryId))) {
                categoryId = wbuyCatMap.get(String(wbuyCategoryId));
            } else if (wp.categoria) {
                // Se vier o nome da categoria como string
                const catName = typeof wp.categoria === 'string' ? wp.categoria : wp.categoria.nome;
                if (catName) {
                    const foundCat = updatedCategoriesList.find(c => c.name.trim().toLowerCase() === catName.trim().toLowerCase());
                    if (foundCat) categoryId = foundCat.id;
                }
            }

            let internalProduct = {
                id: existing ? existing.id : `wbuy_${wbuyId}_${Date.now()}`,
                type: 'product',
                name: productName,
                price: price.toFixed(2),
                description: wp.descricao_completa || wp.descricao_longa || wp.descricao_detalhada || wp.descricao_html || wp.descricao || wp.caracteristicas || wp.resumo || '',
                image: (wp.fotos && wp.fotos.length > 0) ? wp.fotos[0].foto : (existing ? existing.image : null),
                active: wp.ativo === "1" || wp.ativo === 1,
                unit: 'Unidade',
                stock: stock,
                hasPaymentLink: !!paymentLink,
                paymentLink: paymentLink,
                categoryId: categoryId, // <--- Link Category
                variantItems: existing ? existing.variantItems || [] : []
            };

            // Process Variations
            if (hasVariations) {
                // Build a map of color photos from the parent product's photo array
                // Wbuy stores variation photos in wp.fotos with id_cor linking to the color
                const colorPhotoMap = new Map();
                if (Array.isArray(wp.fotos)) {
                    wp.fotos.forEach(foto => {
                        const fotoUrl = foto.foto || foto.url || foto.imagem || foto.src || null;
                        const colorId = foto.id_cor || foto.cor_id || foto.idCor;
                        if (colorId && fotoUrl) {
                            // Store first photo per color (or all if preferred)
                            if (!colorPhotoMap.has(String(colorId))) {
                                colorPhotoMap.set(String(colorId), fotoUrl);
                            }
                        }
                    });
                }

                internalProduct.variantItems = wp.estoque.map(v => {
                    const colorVal = v.cor?.nome ? v.cor.nome.replace(productName, '').replace(/^[\s\-\|]+/, '').trim() : '';
                    const sizeVal = v.variacao?.valor ? v.variacao.valor.replace(productName, '').replace(/^[\s\-\|]+/, '').trim() : '';

                    let varPrice = 0;
                    if (v.valores && v.valores.length > 0) {
                        varPrice = parseFloat(v.valores[0].valor) || price;
                    }

                    // Try to resolve the variation's color photo:
                    // 1. Direct fields in the variation
                    // 2. Via cor object
                    // 3. Via colorPhotoMap (wp.fotos matched by id_cor)
                    // 4. Fallback to parent image
                    const colorId = v.cor?.id || v.id_cor || v.cor_id;
                    const variantImage = 
                        v.imagem || v.foto || v.image ||
                        v.cor?.img || v.cor?.foto || v.cor?.imagem || v.cor?.image || v.cor?.url ||
                        (colorId ? colorPhotoMap.get(String(colorId)) : null) ||
                        null;

                    return {
                        id: `var_${wbuyId}_${v.id}_${Date.now()}`,
                        color: colorVal,
                        size: sizeVal,
                        price: varPrice.toFixed(2),
                        stock: parseFloat(v.quantidade_em_estoque) || 0,
                        image: variantImage,
                        sku: v.sku || String(v.id)
                    };
                });
            }

            productsMap.set(productName.trim().toLowerCase(), internalProduct);
        });

        const mergedProductsList = Array.from(productsMap.values());

        // 5. Save back to the DB
        await prisma.agentConfig.update({ // Changed from updateMany to update for single config
            where: { id: config.id },
            data: { 
                products: JSON.stringify(mergedProductsList),
                categories: updatedCategoriesList.length > 0 ? JSON.stringify(updatedCategoriesList) : undefined
            }
        });

        return res.json({ success: true, count: rawProducts.length, categoriesCount: updatedCategoriesList.length });

    } catch (error) {
        console.error('Erro Wbuy Sync:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- INTEGRATIONS: LOJA INTEGRADA ---
app.post('/api/integrations/lojaintegrada/sync', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.companyId;

        // 1. Fetch current config
        const config = await prisma.agentConfig.findFirst({ where: { companyId } });

        if (!config || !config.integrations) {
            return res.status(400).json({ success: false, message: 'Nenhuma integração configurada.' });
        }

        const integrations = typeof config.integrations === 'string' ? JSON.parse(config.integrations) : config.integrations;
        const liConfig = integrations.lojaintegrada;

        if (!liConfig || !liConfig.enabled || !liConfig.apiKey || !liConfig.appKey) {
            return res.status(400).json({ success: false, message: 'A integração com a Loja Integrada não está ativa ou faltam credenciais.' });
        }

        const headers = {
            'Authorization': `chave_api ${liConfig.apiKey} aplicacao ${liConfig.appKey}`,
            'Content-Type': 'application/json'
        };

        const baseUrl = 'https://api.awsli.com.br/v1';

        // 1. Fetch Categories
        let liCatMap = new Map(); // Map liId -> internalCategoryId
        let updatedCategoriesList = [];

        try {
            const catRes = await fetch(`${baseUrl}/categoria?limit=50`, { headers });
            if (catRes.ok) {
                const catData = await catRes.json();
                const rawCategories = catData.objects || [];

                if (Array.isArray(rawCategories)) {
                    const existingCategories = config.categories ? JSON.parse(config.categories) : [];
                    let catMap = new Map(); // name -> cat
                    
                    existingCategories.forEach(c => {
                        catMap.set(c.name.trim().toLowerCase(), c);
                        if (c.lojaintegradaId) liCatMap.set(String(c.lojaintegradaId), c.id);
                    });

                    rawCategories.forEach(wc => {
                        const catName = wc.nome;
                        if (!catName) return;

                        const catId = String(wc.id);
                        const existingCat = catMap.get(catName.trim().toLowerCase());

                        if (existingCat) {
                            existingCat.lojaintegradaId = catId;
                            liCatMap.set(catId, existingCat.id);
                        } else {
                            const newCat = {
                                id: `cat_li_${catId}_${Date.now()}`,
                                name: catName.trim(),
                                lojaintegradaId: catId
                            };
                            existingCategories.push(newCat);
                            liCatMap.set(catId, newCat.id);
                            catMap.set(catName.trim().toLowerCase(), newCat);
                        }
                    });

                    updatedCategoriesList = existingCategories;
                }
            }
        } catch (catError) {
            console.error('Erro ao buscar categorias Loja Integrada:', catError);
        }

        // 2. Fetch Products
        const prodRes = await fetch(`${baseUrl}/produto?limit=50`, { headers });

        if (!prodRes.ok) {
            console.error(`Status HTTP LI: ${prodRes.status}`);
            return res.status(500).json({ success: false, message: `Erro ao comunicar com API da Loja Integrada (Status ${prodRes.status}).` });
        }

        const prodData = await prodRes.json();
        const rawProducts = prodData.objects || [];

        if (!Array.isArray(rawProducts)) {
            return res.status(500).json({ success: false, message: 'Formato de resposta inesperado da Loja Integrada.' });
        }

        // 3. Transform to Promp Format
        let productsMap = new Map();
        const existingProducts = config.products ? JSON.parse(config.products) : [];
        existingProducts.forEach(p => {
            productsMap.set(p.name.trim().toLowerCase(), p);
        });

        for (const wp of rawProducts) {
            const productName = wp.nome || 'Produto Loja Integrada';
            const prodId = String(wp.id);
            const existing = productsMap.get(productName.trim().toLowerCase());

            let price = 0;
            let imageUrl = null;

            // Fetch Price (N+1 call)
            try {
                const priceRes = await fetch(`${baseUrl}/produto_preco/${prodId}`, { headers });
                if (priceRes.ok) {
                    const priceData = await priceRes.json();
                    price = parseFloat(priceData.preco_venda || priceData.preco_cheio || 0);
                }
            } catch (e) {
                console.error(`Erro ao buscar preço para produto ${prodId}:`, e);
            }

            // Fetch Image (N+1 call)
            try {
                // Tentando query param ?produto=ID conforme padrão
                const imgRes = await fetch(`${baseUrl}/produto_imagem?produto=${prodId}`, { headers });
                if (imgRes.ok) {
                    const imgData = await imgRes.json();
                    if (imgData.objects && imgData.objects.length > 0) {
                        // Geralmente imagem_url ou caminho. Vamos tentar ambos.
                        const imgObj = imgData.objects[0];
                        imageUrl = imgObj.imagem_url || imgObj.caminho;
                        if (imageUrl && !imageUrl.startsWith('http')) {
                            imageUrl = `https:${imageUrl}`; // Garantir protocolo
                        }
                    }
                }
            } catch (e) {
                console.error(`Erro ao buscar imagem para produto ${prodId}:`, e);
            }

            // Category Linking
            let categoryId = existing ? existing.categoryId : null;
            if (wp.categorias && wp.categorias.length > 0) {
                const catUrl = wp.categorias[0]; // ex: /api/v1/categoria/123
                const match = catUrl.match(/\/categoria\/(\d+)/);
                if (match && match[1]) {
                    const liCatId = match[1];
                    if (liCatMap.has(liCatId)) {
                        categoryId = liCatMap.get(liCatId);
                    }
                }
            }

            let internalProduct = {
                id: existing ? existing.id : `li_${prodId}_${Date.now()}`,
                type: 'product',
                name: productName,
                price: price.toFixed(2),
                description: wp.descricao_completa || '',
                image: imageUrl || (existing ? existing.image : null),
                active: wp.ativo === true,
                unit: 'Unidade',
                stock: 0, 
                hasPaymentLink: !!wp.url,
                paymentLink: wp.url || '',
                categoryId: categoryId,
                variantItems: existing ? existing.variantItems || [] : []
            };

            productsMap.set(productName.trim().toLowerCase(), internalProduct);
        }

        const mergedProductsList = Array.from(productsMap.values());

        // 4. Save back to the DB
        await prisma.agentConfig.update({
            where: { id: config.id },
            data: { 
                products: JSON.stringify(mergedProductsList),
                categories: updatedCategoriesList.length > 0 ? JSON.stringify(updatedCategoriesList) : undefined
            }
        });

        return res.json({ success: true, count: rawProducts.length, categoriesCount: updatedCategoriesList.length });

    } catch (error) {
        console.error('Erro Loja Integrada Sync:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- INTEGRATIONS: XML CATALOG ---
// Note: XMLParser is imported at top of file via ES module import

/**
 * Parse XML content and return a flat array of product objects + detected field keys
 */
function parseXmlToProducts(xmlContent) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name, jpath) => false,
        parseTagValue: true,
        trimValues: true,
    });
    const parsed = parser.parse(xmlContent);

    // Try common XML feed structures
    let items = [];
    const findItems = (obj, depth = 0) => {
        if (depth > 6 || !obj || typeof obj !== 'object') return;
        // Common list element names
        const listKeys = ['item', 'product', 'produto', 'entry', 'record', 'offer', 'oferta', 'Product', 'Item'];
        for (const key of Object.keys(obj)) {
            if (listKeys.includes(key)) {
                const val = obj[key];
                items = Array.isArray(val) ? val : [val];
                return;
            }
            findItems(obj[key], depth + 1);
            if (items.length > 0) return;
        }
    };
    findItems(parsed);

    if (items.length === 0) return { items: [], fields: [] };

    // Collect all field names
    const fieldSet = new Set();
    items.slice(0, 20).forEach(item => {
        if (item && typeof item === 'object') {
            Object.keys(item).forEach(k => {
                if (!k.startsWith('@_')) fieldSet.add(k);
            });
        }
    });

    return { items, fields: Array.from(fieldSet) };
}

/**
 * Apply field mapping to a raw XML item and return a normalized product
 */
function applyXmlMapping(item, fieldMapping) {
    const get = (key) => {
        if (!key || !item) return '';
        let val = item[key];
        if (val === undefined || val === null) return '';
        
        // Se o valor for um objeto (comum no fast-xml-parser para atributos ou nós com texto), 
        // tentamos pegar o texto principal ou converter para string.
        if (typeof val === 'object') {
            val = val['#text'] || val._ || val.text || JSON.stringify(val);
        }
        
        return String(val).trim();
    };

    return {
        title: get(fieldMapping.title),
        description: get(fieldMapping.description),
        imageUrl: get(fieldMapping.imageUrl),
        size: get(fieldMapping.size),
        price: get(fieldMapping.price),
        stock: get(fieldMapping.stock),
        productUrl: get(fieldMapping.productUrl),
        category: get(fieldMapping.category),
        color: get(fieldMapping.color),
        material: get(fieldMapping.material),
        extraRules: get(fieldMapping.extraRules),
    };
}

/**
 * Core sync worker for a single XmlCatalogSource record
 */
async function xmlCatalogSyncWorker(source) {
    console.log(`[XML Catalog] Syncing source: ${source.name} (${source.id})`);
    try {
        const response = await fetch(source.xmlUrl, {
            headers: { 'User-Agent': 'PrompIA-XmlCatalog/1.0' },
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const xmlContent = await response.text();
        const fieldMapping = typeof source.fieldMapping === 'string'
            ? JSON.parse(source.fieldMapping)
            : source.fieldMapping;

        const { items } = parseXmlToProducts(xmlContent);
        const mappedProducts = [];

        for (const item of items) {
            const mapped = applyXmlMapping(item, fieldMapping);
            if (!mapped.title) continue;

            mappedProducts.push({
                id: `xml_${source.id}_${Date.now()}_${mappedProducts.length}`,
                type: 'product',
                name: mapped.title,
                description: mapped.description || '',
                image: mapped.imageUrl || null,
                size: mapped.size || '',
                price: mapped.price || '0.00',
                stock: parseFloat(mapped.stock) || 0,
                hasPaymentLink: !!mapped.productUrl,
                paymentLink: mapped.productUrl || '',
                category: mapped.category || '',
                color: mapped.color || '',
                material: mapped.material || '',
                extraRules: mapped.extraRules || '',
                active: true,
                unit: 'Unidade',
                xmlSourceId: source.id,
            });
        }

        const nextRun = new Date(Date.now() + source.refreshMinutes * 60 * 1000);
        await prisma.xmlCatalogSource.update({
            where: { id: source.id },
            data: {
                lastSyncAt: new Date(),
                lastSyncStatus: 'ok',
                lastSyncMessage: `${mappedProducts.length} produtos importados`,
                productCount: mappedProducts.length,
                products: JSON.stringify(mappedProducts),
            }
        });

        console.log(`[XML Catalog] Done: ${mappedProducts.length} products synced for ${source.name}`);
        return { success: true, count: mappedProducts.length };
    } catch (err) {
        console.error(`[XML Catalog] Error syncing ${source.id}:`, err.message);
        await prisma.xmlCatalogSource.update({
            where: { id: source.id },
            data: {
                lastSyncAt: new Date(),
                lastSyncStatus: 'error',
                lastSyncMessage: err.message,
            }
        });
        return { success: false, error: err.message };
    }
}

// POST /api/integrations/xml/preview — fetch XML and return detected fields + sample items
app.post('/api/integrations/xml/preview', authenticateToken, async (req, res) => {
    try {
        const { xmlUrl } = req.body;
        if (!xmlUrl) return res.status(400).json({ success: false, message: 'xmlUrl é obrigatório.' });

        const response = await fetch(xmlUrl, {
            headers: { 'User-Agent': 'PrompIA-XmlCatalog/1.0' },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            return res.status(400).json({ success: false, message: `Não foi possível acessar o XML (HTTP ${response.status}).` });
        }

        const xmlContent = await response.text();
        const { items, fields } = parseXmlToProducts(xmlContent);

        if (items.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum produto encontrado no XML. Verifique a estrutura do arquivo.' });
        }

        // Return fields + first 3 items as preview
        res.json({
            success: true,
            fields,
            sampleItems: items.slice(0, 3),
            totalItems: items.length,
        });
    } catch (err) {
        console.error('[XML Preview] Error:', err);
        res.status(500).json({ success: false, message: err.message || 'Erro ao processar XML.' });
    }
});

// POST /api/integrations/xml/save — create or update an XML catalog source
app.post('/api/integrations/xml/save', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { id, name, xmlUrl, fieldMapping, refreshMinutes } = req.body;
        if (!xmlUrl || !name || !fieldMapping) {
            return res.status(400).json({ success: false, message: 'name, xmlUrl e fieldMapping são obrigatórios.' });
        }

        const data = {
            name,
            xmlUrl,
            fieldMapping: typeof fieldMapping === 'string' ? fieldMapping : JSON.stringify(fieldMapping),
            refreshMinutes: parseInt(refreshMinutes) || 60,
            enabled: true,
        };

        let source;
        if (id) {
            source = await prisma.xmlCatalogSource.updateMany({
                where: { id, companyId },
                data,
            });
            source = await prisma.xmlCatalogSource.findFirst({ where: { id, companyId } });
        } else {
            source = await prisma.xmlCatalogSource.create({
                data: { ...data, companyId },
            });
        }

        // Trigger immediate sync
        xmlCatalogSyncWorker(source).catch(console.error);

        res.json({ success: true, source });
    } catch (err) {
        console.error('[XML Save] Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/integrations/xml — list all XML sources for the company
app.get('/api/integrations/xml', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const sources = await prisma.xmlCatalogSource.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, sources });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/integrations/xml/:id
app.delete('/api/integrations/xml/:id', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { id } = req.params;
        await prisma.xmlCatalogSource.deleteMany({ where: { id, companyId } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/integrations/xml/:id/toggle — enable or disable a source
app.put('/api/integrations/xml/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { id } = req.params;
        const source = await prisma.xmlCatalogSource.findFirst({ where: { id, companyId } });
        if (!source) return res.status(404).json({ success: false, message: 'Fonte não encontrada.' });
        const updated = await prisma.xmlCatalogSource.update({
            where: { id },
            data: { enabled: !source.enabled }
        });
        res.json({ success: true, source: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/integrations/xml/:id/sync — force immediate sync
app.post('/api/integrations/xml/:id/sync', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { id } = req.params;
        const source = await prisma.xmlCatalogSource.findFirst({ where: { id, companyId } });
        if (!source) return res.status(404).json({ success: false, message: 'Fonte não encontrada.' });
        const result = await xmlCatalogSyncWorker(source);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Follow-up IA ---

function calculateNextDate(attempt) {
    const now = new Date();
    const next = new Date(now);
    if (attempt.delayUnit === 'minutes') next.setMinutes(now.getMinutes() + Number(attempt.delayValue));
    if (attempt.delayUnit === 'hours')   next.setHours(now.getHours() + Number(attempt.delayValue));
    if (attempt.delayUnit === 'days')    next.setDate(now.getDate() + Number(attempt.delayValue));
    return next;
}

const processSingleFollowUp = async (state) => {
    const { id: stateId, companyId, remoteJid, attemptIndex, agentConfigId } = state;
    const cleanPhone = String(remoteJid).replace(/\D/g, '');

    console.log(`[FollowUp] Processando ${cleanPhone} | tentativa=${attemptIndex} | agentConfigId=${agentConfigId}`);

    // --- 1. Load agent config ---
    // If agentConfigId is set, load that specific agent. Otherwise, find the first agent
    // in this company with Follow-up enabled.
    let config = agentConfigId ? await getCompanyConfig(companyId, agentConfigId) : null;
    let followUpCfg = config?.followUpConfig;

    if (!followUpCfg?.enabled) {
        // Fallback: search all agents for the company that have followUp enabled
        console.log(`[FollowUp] Config do agente ${agentConfigId} não tem followUp ativo. Buscando alternativa...`);
        const allAgentConfigs = await prisma.agentConfig.findMany({ where: { companyId } });
        const safeParse = (str) => { try { return str ? JSON.parse(str) : null; } catch { return null; } };
        const agentWithFollowUp = allAgentConfigs.find(a => {
            const cfg = safeParse(a.followUpConfig);
            return cfg?.enabled === true;
        });
        if (!agentWithFollowUp) {
            console.log(`[FollowUp] Nenhum agente da empresa ${companyId} tem Follow-up ativo. Parando.`);
            await prisma.contactState.update({ where: { id: stateId }, data: { isActive: false } });
            return;
        }
        config = await getCompanyConfig(companyId, agentWithFollowUp.id);
        followUpCfg = config?.followUpConfig;
        console.log(`[FollowUp] Usando config do agente ${agentWithFollowUp.id} para ${cleanPhone}.`);
    }

    console.log(`[FollowUp] followUpCfg.enabled=${followUpCfg?.enabled} | tone=${followUpCfg?.tone} | attempts=${followUpCfg?.attempts?.length}`);

    // --- 2. Check ignored numbers ---
    const ignoreList = (followUpCfg.ignoreNumbers || '')
        .split(',').map(n => n.trim().replace(/\D/g, '')).filter(Boolean);
    if (ignoreList.includes(cleanPhone)) {
        console.log(`[FollowUp] ${cleanPhone} está na lista de ignorados. Parando.`);
        await prisma.contactState.update({ where: { id: stateId }, data: { isActive: false } });
        return;
    }

    // --- 3. Check active attempts ---
    const activeAttempts = (followUpCfg.attempts || []).filter(a => a.active);
    console.log(`[FollowUp] Tentativas ativas: ${activeAttempts.length} | índice atual: ${attemptIndex}`);
    if (attemptIndex >= activeAttempts.length) {
        console.log(`[FollowUp] Tentativas esgotadas para ${cleanPhone}.`);
        await prisma.contactState.update({ where: { id: stateId }, data: { isActive: false } });
        return;
    }

    // --- 4. Load conversation history ---
    const history = await prisma.testMessage.findMany({
        where: { companyId, sessionId: cleanPhone },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log(`[FollowUp] Histórico encontrado para ${cleanPhone}: ${history.length} mensagem(ns).`);

    // If the most recent message is from the client, the STOP timer failed to fire.
    // The conversation is no longer waiting for a response — stop the sequence.
    if (history.length > 0) {
        const lastMsg = history[0]; // already desc order, so [0] is newest
        if (lastMsg.sender === 'user') {
            console.log(`[FollowUp] Última mensagem é do cliente. Conversa já foi retomada. Parando.`);
            await prisma.contactState.update({ where: { id: stateId }, data: { isActive: false } });
            return;
        }
    }

    const historyText = history.length > 0
        ? history.slice().reverse().map(m => `${m.sender === 'user' ? 'Cliente' : 'Agente'}: ${m.text}`).join('\n')
        : null;

    // --- 5. Get OpenAI key ---
    const globalConfig = await prisma.globalConfig.findFirst();
    const openaiKey = config.openaiKey || globalConfig?.openaiKey || process.env.OPENAI_API_KEY;
    console.log(`[FollowUp] Chave OpenAI encontrada: ${openaiKey ? 'SIM' : 'NÃO'}`);
    if (!openaiKey) {
        console.log('[FollowUp] Sem chave OpenAI. Abortando sem penalizar a tentativa.');
        return;
    }
    const openai = new OpenAI({ apiKey: openaiKey });

    // --- 6. Generate follow-up message via AI ---
    // The AI's ONLY job is to GENERATE the message. The decision to send was already made
    // by the timer system (timer is active = conversation is waiting for client response).
    const toneMap = {
        animated:    'curto, enérgico e direto ao ponto',
        serious:     'profissional e consultivo',
        ice_breaker: 'leve, amigável e descontraído'
    };
    const toneDesc = toneMap[followUpCfg.tone] || 'profissional';
    const personaName = config.persona?.name || 'Assistente';

    const systemMsg = `Você é ${personaName}. Tom: ${toneDesc}. Gere mensagens de follow-up curtas e naturais para retomar conversas com clientes. Máximo 2 frases. Não mencione que é automático. Não repita informações já enviadas.`;

    const userMsg = historyText
        ? `O cliente parou de responder após nossa última mensagem. Baseado no contexto abaixo, gere uma mensagem de follow-up para retomá-la:\n\n${historyText}`
        : `Um cliente parou de responder. Gere uma mensagem curta e natural para retomar o contato.`;

    let followUpMsg = '';
    try {
        const aiResp = await openai.chat.completions.create({
            model: config.model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg }
            ],
            max_tokens: 200,
            temperature: 0.7
        });
        followUpMsg = aiResp.choices[0]?.message?.content?.trim() || '';
        console.log(`[FollowUp] Mensagem gerada para ${cleanPhone}: "${followUpMsg}"`);
    } catch (err) {
        console.error(`[FollowUp] Erro ao chamar OpenAI para ${cleanPhone}:`, err.message);
        return;
    }

    if (!followUpMsg) {
        console.error(`[FollowUp] OpenAI retornou resposta vazia para ${cleanPhone}. Abortando.`);
        return;
    }

    // --- 7. Send via Promp ---
    console.log(`[FollowUp] Enviando via Promp para ${cleanPhone}. prompUuid=${config.prompUuid ? 'ok' : 'AUSENTE'} | prompToken=${config.prompToken ? 'ok' : 'AUSENTE'}`);
    const sent = await sendPrompMessage(config, cleanPhone, followUpMsg, null, null, null);
    if (!sent) {
        console.error(`[FollowUp] sendPrompMessage retornou false para ${cleanPhone} (credenciais ausentes). Parando.`);
        return;
    }

    console.log(`[FollowUp] Mensagem enviada para ${cleanPhone} (tentativa ${attemptIndex + 1}/${activeAttempts.length})`);

    const nextIndex = attemptIndex + 1;
    if (nextIndex >= activeAttempts.length) {
        await prisma.contactState.update({ where: { id: state.id }, data: { isActive: false } });
        console.log(`[FollowUp] Sequência concluída para ${cleanPhone}.`);
    } else {
        const nextAttempt = activeAttempts[nextIndex];
        const nextDate = calculateNextDate(nextAttempt);
        await prisma.contactState.update({
            where: { id: state.id },
            data: { attemptIndex: nextIndex, nextFollowUp: nextDate, lastOutbound: new Date() }
        });
        console.log(`[FollowUp] Próxima tentativa para ${cleanPhone}: ${nextDate.toISOString()}`);
    }
};

// --- Follow-up IA Scheduler (runs every 60 seconds) ---
setInterval(async () => {
    try {
        const now = new Date();
        const dueStates = await prisma.contactState.findMany({
            where: { isActive: true, nextFollowUp: { lte: now } }
        });

        if (dueStates.length > 0) {
            console.log(`[FollowUp Scheduler] ${dueStates.length} follow-up(s) vencido(s).`);
        }

        for (const state of dueStates) {
            processSingleFollowUp(state).catch(err =>
                console.error(`[FollowUp] Erro ao processar ${state.remoteJid}:`, err.message)
            );
        }
    } catch (err) {
        console.error('[FollowUp Scheduler] Erro geral:', err.message);
    }
}, 60 * 1000);

// --- CRM Pipeline Automation Job (runs every 5 minutes) ---
setInterval(() => {
    runCRMAutomationJob(prisma).catch(e => console.error('[CRM Job] Unhandled error:', e.message));
}, 5 * 60 * 1000);

// --- XML Catalog Scheduler (runs every minute) ---
setInterval(async () => {
    try {
        const sources = await prisma.xmlCatalogSource.findMany({
            where: {
                enabled: true,
                OR: [
                    { lastSyncAt: null },
                    { lastSyncAt: { lt: new Date(Date.now() - 60000) } } // at least 1 minute ago
                ]
            }
        });

        for (const source of sources) {
            const minutesSinceLastSync = source.lastSyncAt
                ? (Date.now() - new Date(source.lastSyncAt).getTime()) / 60000
                : Infinity;

            if (minutesSinceLastSync >= (source.refreshMinutes || 60)) {
                xmlCatalogSyncWorker(source).catch(console.error);
            }
        }
    } catch (err) {
        console.error('[XML Scheduler] Error:', err.message);
    }
}, 60000); // Check every minute

// Startup Check

if (process.env.OPENAI_API_KEY) {
    console.log('[Startup] Global OpenAI Key detected in ENV.');
} else {
    console.warn('[Startup] No Global OpenAI Key in ENV. Will rely on DB Config.');
}

// Serve Static Frontend (Vite Build)
app.use(express.static(path.join(__dirname, '../dist')));

// Serve Uploaded Media (Public HTTP Path /api/uploads -> server/public/uploads dir)
app.use('/api/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- MEDIA UPLOAD CONFIGURATION ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        // Ensure dir exists
        fsCommon.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'img-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Nenhuma imagem recebida pela API.' });
        }

        // Em ambientes de nuvem atrás do Cloudflare/Nginx, preferir req.headers['x-forwarded-proto']
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const baseUrl = `${protocol}://${req.get('host')}`;
        const finalUrl = `${baseUrl}/api/uploads/${req.file.filename}`;

        console.log(`[Upload API] Arquivo recebido e salvo em public/uploads. URL: ${finalUrl}`);

        res.json({ success: true, url: finalUrl });
    } catch (e) {
        console.error('[Upload API] Falha inexperada no Uploader:', e);
        res.status(500).json({ message: 'Erro interno ao salvar arquivo' });
    }
});


// --- Auth Routes ---

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, companyId: user.companyId, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                companyId: user.companyId
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, email: true, role: true, companyId: true, company: true }
        });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user' });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Senha atual incorreta' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.json({ success: true, message: 'Senha alterada com sucesso' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Erro ao alterar senha' });
    }
});





// --- Forgot Password Routes ---

// Email Transporter Config
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: 'Email não encontrado' });

        // Generate Token
        const token = crypto.randomBytes(20).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetToken: token,
                resetTokenExpires: expires
            }
        });

        // Use FRONTEND_URL or fallback to localhost
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Promp AI" <noreply@promp.com.br>',
            to: email,
            subject: 'Recuperação de Senha - Promp AI',
            html: `<p>Você solicitou a redefinição de senha.</p>
                   <p>Clique no link abaixo para criar uma nova senha:</p>
                   <a href="${resetLink}">${resetLink}</a>
                   <p>Este link expira em 1 hora.</p>`
        });

        res.json({ message: 'Email de recuperação enviado.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Erro ao processar solicitação' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpires: { gt: new Date() }
            }
        });

        if (!user) return res.status(400).json({ message: 'Token inválido ou expirado' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpires: null
            }
        });

        res.json({ message: 'Senha redefinida com sucesso' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Erro ao redefinir senha' });
    }
});

// --- CATEGORIES Routes ---

// List Categories
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const config = await prisma.agentConfig.findFirst({
            where: { companyId },
            select: { categories: true }
        });

        const categories = config?.categories ? JSON.parse(config.categories) : [];
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Erro ao buscar categorias.' });
    }
});

// Create Category
app.post('/api/categories', authenticateToken, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome é obrigatório.' });

    try {
        const { companyId } = req.user;
        const config = await prisma.agentConfig.findFirst({
            where: { companyId },
            select: { id: true, categories: true }
        });

        if (!config) return res.status(404).json({ message: 'Configuração não encontrada.' });

        let categories = config.categories ? JSON.parse(config.categories) : [];
        const newCategory = {
            id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name: name.trim()
        };

        categories.push(newCategory);

        await prisma.agentConfig.update({
            where: { id: config.id },
            data: { categories: JSON.stringify(categories) }
        });

        res.json(newCategory);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ message: 'Erro ao criar categoria.' });
    }
});

// Delete Category
app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const { companyId } = req.user;
        const config = await prisma.agentConfig.findFirst({
            where: { companyId },
            select: { id: true, categories: true, products: true }
        });

        if (!config) return res.status(404).json({ message: 'Configuração não encontrada.' });

        let categories = config.categories ? JSON.parse(config.categories) : [];
        categories = categories.filter(c => c.id !== id);

        // Optional: Remove category from products that use it
        let products = config.products ? JSON.parse(config.products) : [];
        products = products.map(p => p.categoryId === id ? { ...p, categoryId: null } : p);

        await prisma.agentConfig.update({
            where: { id: config.id },
            data: { 
                categories: JSON.stringify(categories),
                products: JSON.stringify(products)
            }
        });

        res.json({ success: true, message: 'Categoria removida.' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ message: 'Erro ao remover categoria.' });
    }
});

// Batch Update Product Category
app.post('/api/products/batch-category', authenticateToken, async (req, res) => {
    const { productIds, categoryId } = req.body; // categoryId can be string or null

    if (!Array.isArray(productIds)) {
        return res.status(400).json({ message: 'productIds deve ser um array.' });
    }

    try {
        const { companyId } = req.user;
        const config = await prisma.agentConfig.findFirst({
            where: { companyId },
            select: { id: true, products: true }
        });

        if (!config) return res.status(404).json({ message: 'Configuração não encontrada.' });

        let products = config.products ? JSON.parse(config.products) : [];
        
        products = products.map(p => {
            // Conversão de ID para string para comparar com segurança
            if (productIds.includes(p.id) || productIds.includes(String(p.id))) {
                return { ...p, categoryId: categoryId || null };
            }
            return p;
        });

        await prisma.agentConfig.update({
            where: { id: config.id },
            data: { products: JSON.stringify(products) }
        });

        res.json({ success: true, message: `${productIds.length} produtos atualizados.` });
    } catch (error) {
        console.error('Error batch updating products:', error);
        res.status(500).json({ message: 'Erro ao atualizar produtos em lote.' });
    }
});

// --- TAGS (Autotagging) Routes ---


// List tags directly from Promp API
app.get('/api/tags/promp', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true }
        });

        if (!config || !config.prompUuid || !config.prompToken) {
            return res.status(400).json({ message: 'Integração com Promp não configurada.' });
        }

        const tags = await getPrompTags(config);
        res.json(tags);
    } catch (error) {
        console.error('Error fetching Promp tags:', error);
        res.status(500).json({ message: 'Erro ao buscar tags no Promp.' });
    }
});

app.post('/api/tags/promp/create', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true }
        });

        if (!config || !config.prompUuid || !config.prompToken) {
            return res.status(400).json({ message: 'Integração com Promp não configurada.' });
        }

        const tagData = {
            name: req.body.name,
            color: req.body.color || '#2563eb',
            isActive: req.body.isActive !== undefined ? req.body.isActive : true
        };

        const result = await createPrompTag(config, tagData);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Error creating Promp tag:', error);
        res.status(500).json({ message: 'Erro ao criar etiqueta no Promp.' });
    }
});

app.put('/api/tags/promp/:id', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true }
        });

        if (!config || !config.prompUuid || !config.prompToken) {
            return res.status(400).json({ message: 'Integração com Promp não configurada.' });
        }

        const tagId = req.params.id;
        const tagData = {
            name: req.body.name,
            color: req.body.color || '#2563eb',
            isActive: req.body.isActive !== undefined ? req.body.isActive : true
        };

        const result = await updatePrompTag(config, tagId, tagData);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Error updating Promp tag:', error);
        res.status(500).json({ message: 'Erro ao atualizar etiqueta no Promp.' });
    }
});

app.delete('/api/tags/promp/:id', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true }
        });

        if (!config || !config.prompUuid || !config.prompToken) {
            return res.status(400).json({ message: 'Integração com Promp não configurada.' });
        }

        const tagId = req.params.id;
        const result = await deletePrompTag(config, tagId);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Error deleting Promp tag:', error);
        res.status(500).json({ message: 'Erro ao excluir etiqueta no Promp.' });
    }
});

// List configured TagTriggers from Database
app.get('/api/tags/triggers', authenticateToken, async (req, res) => {
    try {
        const triggers = await prisma.tagTrigger.findMany({
            where: { companyId: req.user.companyId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(triggers);
    } catch (error) {
        console.error('Error fetching TagTriggers:', error);
        res.status(500).json({ message: 'Erro ao buscar gatilhos de tags.' });
    }
});

// Create new TagTrigger
app.post('/api/tags/triggers', authenticateToken, async (req, res) => {
    const { tagId, tagName, triggerCondition } = req.body;

    if (!tagId || !tagName || !triggerCondition) {
        return res.status(400).json({ message: 'Dados incompletos.' });
    }

    try {
        const newTrigger = await prisma.tagTrigger.create({
            data: {
                companyId: req.user.companyId,
                tagId: Number(tagId),
                tagName,
                triggerCondition
            }
        });
        res.json(newTrigger);
    } catch (error) {
        console.error('Error creating TagTrigger:', error);
        res.status(500).json({ message: 'Erro ao criar gatilho.' });
    }
});

// Update TagTrigger
app.put('/api/tags/triggers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { tagId, tagName, triggerCondition } = req.body;

    if (!tagId || !tagName || !triggerCondition) {
        return res.status(400).json({ message: 'Dados incompletos.' });
    }

    try {
        const updatedTrigger = await prisma.tagTrigger.updateMany({
            where: {
                id,
                companyId: req.user.companyId
            },
            data: {
                tagId: Number(tagId),
                tagName,
                triggerCondition
            }
        });

        if (updatedTrigger.count === 0) {
            return res.status(404).json({ message: 'Gatilho não encontrado.' });
        }

        res.json({ message: 'Gatilho atualizado com sucesso.' });
    } catch (error) {
        console.error('Error updating TagTrigger:', error);
        res.status(500).json({ message: 'Erro ao atualizar gatilho.' });
    }
});

// Delete TagTrigger
app.delete('/api/tags/triggers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.tagTrigger.delete({
            where: {
                id,
                companyId: req.user.companyId // Security check
            }
        });
        res.json({ message: 'Gatilho removido com sucesso.' });
    } catch (error) {
        console.error('Error deleting TagTrigger:', error);
        res.status(500).json({ message: 'Erro ao remover gatilho.' });
    }
});


// --- Admin Routes ---

const authenticateAdmin = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Acesso negado' });
        }
        next();
    });
};

app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const [users, companies, configs] = await Promise.all([
            prisma.user.count(),
            prisma.company.count(),
            prisma.agentConfig.count()
        ]);
        res.json({ users, companies, configs });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar estatísticas' });
    }
});

// --- Notification Routes (Admin) ---

app.get('/api/admin/notifications', authenticateAdmin, async (req, res) => {
    try {
        let notifications = await prisma.notification.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Define known system updates that should have notifications generated
        const systemUpdates = [
            {
                title: "* Novas Métricas de Desempenho no Dashboard",
                content: "Adicionamos uma nova seção de métricas ao seu Painel! Agora você pode acompanhar os produtos mais desejados, mais vendidos, clientes mais ativos e o tempo total poupado pela sua IA. Confira o resumo no topo da sua página inicial.",
                type: "NEWS",
                status: "DRAFT"
            },
            {
                title: "* Novo Recurso: Automação de Etiquetas da IA",
                content: "Sua IA agora pode classificar os tickets automaticamente baseada nas conversas! Acesse a aba 'Etiquetas IA' no menu lateral para criar gatilhos que aplicam as etiquetas do Promp direto no atendimento.",
                type: "IMPROVEMENT",
                status: "DRAFT"
            }
        ];

        // Auto-seed missing updates
        for (const update of systemUpdates) {
            const exists = notifications.some(n => n.title === update.title);
            if (!exists) {
                const newSeed = await prisma.notification.create({
                    data: update
                });
                notifications.push(newSeed);
            }
        }

        // Resorteia depois da injeção
        notifications.sort((a, b) => b.createdAt - a.createdAt);

        res.json(notifications);
    } catch (error) {
        console.error('Erro ao buscar notificações:', error);
        res.status(500).json({ message: 'Erro ao buscar notificações' });
    }
});

app.post('/api/admin/notifications', authenticateAdmin, async (req, res) => {
    const { title, content, type, status } = req.body;
    try {
        const notification = await prisma.notification.create({
            data: {
                title,
                content,
                type: type || 'INFO',
                status: status || 'DRAFT'
            }
        });
        res.json(notification);
    } catch (error) {
        console.error('Erro ao criar notificação:', error);
        res.status(500).json({ message: 'Erro ao criar notificação', error: error.message });
    }
});

app.put('/api/admin/notifications/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, content, type, status } = req.body;
    try {
        const notification = await prisma.notification.update({
            where: { id },
            data: { title, content, type, status }
        });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar notificação' });
    }
});

app.delete('/api/admin/notifications/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.notification.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao excluir notificação' });
    }
});

// --- GitHub Webhook Route (AI-generated Notifications) ---
app.post('/api/webhooks/github', async (req, res) => {
    const payload = req.body;
    
    // 1. Validar se é um push event
    const commits = payload.commits || [];
    const repository = payload.repository?.name || 'Projeto';
    
    if (commits.length === 0) {
        return res.json({ status: 'ignored_no_commits' });
    }
    
    // 2. Coletar mensagens dos commits
    // Extraindo apenas mensagens úteis (ignorando merge commits se preferir, mas vamos pegar todos)
    const commitMessages = commits.map(c => `- ${c.message} (por ${c.author?.name || 'Dev'})`).join('\n');
    
    try {
        // 3. Buscar Chave de IA (OpenAI)
        const globalConfig = await prisma.globalConfig.findFirst();
        const openaiKey = globalConfig?.openaiKey || process.env.OPENAI_API_KEY;
        
        let title = `Atualização no ${repository}`;
        let content = `Novas alterações foram enviadas para o repositório.`;
        
        if (openaiKey) {
            // OpenAI já importado no topo
            const openai = new OpenAI({ apiKey: openaiKey });
            
            const prompt = `Você é um assistente de comunicação para uma equipe de desenvolvimento. Recebemos atualizações no GitHub no repositório ${repository}.
            
Aqui estão os commits recebidos:
${commitMessages}

**Sua missão**: Gerar uma notificação amigável, entusiasmada e fácil de ler para os usuários do sistema Agente Promp. Foque no benefício ou no que mudou.
A linguagem deve ser em Português do Brasil, profissional mas calorosa.
Retorne um JSON com:
{
  "title": "Um título curto e atrativo (máx 50 caracteres)",
  "content": "A descrição amigável das alterações (pode usar quebras de linha e emojis), com um tom de novidade ou melhoria."
}`;

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' }
            });
            
            const aiData = JSON.parse(response.choices[0]?.message?.content || '{}');
            title = aiData.title || title;
            content = aiData.content || content;
        } else {
            console.warn('[Github Webhook] Chave OpenAI não encontrada. Usando texto padrão.');
        }
        
        // 4. Salvar Notificação no Banco de Dados como RASCUNHO
        // Usamos status: 'DRAFT' para aprovação humana
        const notification = await prisma.notification.create({
            data: {
                title: String(title).substring(0, 100), // Prevenir estouro
                content: content,
                type: 'NEWS',
                status: 'DRAFT'
            }
        });
        
        console.log(`[Github Webhook] Notificação criada: ID ${notification.id} (${notification.title})`);
        res.json({ success: true, notificationId: notification.id });
    } catch (error) {
        console.error('[Github Webhook] Erro ao processar:', error);
        res.status(500).json({ message: 'Erro ao processar webhook', error: error.message });
    }
});


// --- User Stats Route (Dashboard) ---
app.get('/api/stats', authenticateToken, async (req, res) => {
    const { companyId } = req.user;

    try {
        // 1. Fetch Config to get product definitions
        const config = await prisma.agentConfig.findFirst({
            where: { companyId },
            select: { products: true }
        });

        const products = config?.products ? (typeof config.products === 'string' ? JSON.parse(config.products) : config.products) : [];

        // 2. Fetch all messages for this company
        const messages = await prisma.testMessage.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' }
        });

        // Metrics containers
        const desiredProducts = {}; // { id: { count: number, guessedName: string } }
        const soldProducts = {};    // { name: count } (using link as proxy)
        const activeCustomers = {}; // { sessionId: count }
        const customerNames = {};   // { sessionId: name }
        const dailyStats = {};      // { 'YYYY-MM-DD': { messages: 0, contacts: Set } }
        let aiMessagesCount = 0;

        messages.forEach(msg => {
            // Agrupar por dia para o gráfico
            try {
                const dateStr = msg.createdAt ? new Date(msg.createdAt).toISOString().split('T')[0] : 'Desconhecido';
                if (dateStr !== 'Desconhecido') {
                    if (!dailyStats[dateStr]) {
                        dailyStats[dateStr] = { messages: 0, contacts: new Set() };
                    }
                    if (msg.sender === 'ai') {
                        dailyStats[dateStr].messages++;
                    }
                    if (msg.sessionId) {
                        dailyStats[dateStr].contacts.add(msg.sessionId);
                    }
                }
            } catch (e) { }

            if (msg.sender === 'ai') {
                aiMessagesCount++;

                // Detect Desired Products ([SHOW_IMAGE: ID])
                const imageMatches = msg.text.match(/\[SHOW_IMAGE:\s*(\w+)\]/g);
                if (imageMatches) {
                    imageMatches.forEach(match => {
                        const id = match.match(/\[SHOW_IMAGE:\s*(\w+)\]/)[1];
                        if (!desiredProducts[id]) desiredProducts[id] = { count: 0, guessedName: null };
                        desiredProducts[id].count++;

                        // Try to guess name from preceding context if not known
                        if (!desiredProducts[id].guessedName) {
                            // Look for product names or patterns before the tag
                            const beforeTag = msg.text.split(match)[0].trim();
                            // Simple heuristic: get the last few words or lines
                            const lines = beforeTag.split('\n');
                            const lastLine = lines[lines.length - 1].trim();
                            // Clean common prefixes like "Aqui está o ", "Veja este ", etc.
                            const cleaned = lastLine
                                .replace(/.*(Aqui está o|Veja este|Olha o|sobre o|um)\s+/i, '')
                                .replace(/[:\-\*]/g, '')
                                .trim();

                            if (cleaned && cleaned.length > 2 && cleaned.length < 50) {
                                desiredProducts[id].guessedName = cleaned;
                            }
                        }
                    });
                }

                // Detect Sold Products ([LINK: URL])
                const linkMatches = msg.text.match(/\[LINK:\s*([^\]]+)\]/g);
                if (linkMatches) {
                    linkMatches.forEach(match => {
                        const urlParsed = match.match(/\[LINK:\s*([^\]]+)\]/)[1].trim();
                        // Try to find product by link
                        const product = products.find(p => p.paymentLink === urlParsed);
                        if (product) {
                            soldProducts[product.name] = (soldProducts[product.name] || 0) + 1;
                        }
                    });
                }
            } else {
                // Sender is user/customer
                const sessionKey = msg.sessionId || 'Desconhecido';
                activeCustomers[sessionKey] = (activeCustomers[sessionKey] || 0) + 1;

                // Try to extract name from metadata
                if (!customerNames[sessionKey] && msg.metadata) {
                    try {
                        const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
                        // Extremely flexible name search in JSON
                        const name = meta.pushName ||
                            meta.contact?.name ||
                            meta.body?.contact?.name ||
                            meta.msg?.pushname ||
                            meta.metadata?.pushName ||
                            meta.data?.pushName ||
                            meta.name;
                        if (name) customerNames[sessionKey] = name;
                    } catch (e) { }
                }
            }
        });

        // Format and sort results
        const sortedDesired = Object.entries(desiredProducts)
            .map(([id, data]) => {
                const product = products.find(p => String(p.id) === String(id));
                const name = product ? product.name : (data.guessedName || `Produto #${id}`);
                return { name, count: data.count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const sortedSold = Object.entries(soldProducts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const sortedCustomers = Object.entries(activeCustomers)
            .map(([session, count]) => {
                const name = customerNames[session] || session;
                return { session: name, count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Time Saved: Each AI message = 2 minutes saved (estimation)
        const totalMinutesSaved = aiMessagesCount * 2;
        const hours = Math.floor(totalMinutesSaved / 60);
        const minutes = totalMinutesSaved % 60;
        const timeSavedFormatted = `${hours}h ${minutes}min`;

        // Format daily stats
        const formattedDailyStats = Object.entries(dailyStats).map(([date, data]) => ({
            date: date,
            messages: data.messages,
            contacts: data.contacts.size
        })).sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            desiredProducts: sortedDesired,
            soldProducts: sortedSold,
            activeCustomers: sortedCustomers,
            timeSaved: timeSavedFormatted,
            totalAiMessages: aiMessagesCount,
            dailyStats: formattedDailyStats
        });

    } catch (error) {
        console.error('[Stats API] Error:', error);
        res.status(500).json({ error: 'Erro ao processar estatísticas' });
    }
});

// --- Notification Routes (User) ---
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log(`[Notifications] Fetching for user ${userId}`);
        
        const notifications = await prisma.notification.findMany({
            where: { status: 'APPROVED' },
            orderBy: { createdAt: 'desc' },
            include: {
                readBy: {
                    where: { userId }
                }
            }
        });

        console.log(`[Notifications] Found ${notifications.length} approved notifications`);

        const formatted = notifications.map(notif => ({
            ...notif,
            read: notif.readBy ? notif.readBy.length > 0 : false,
            readBy: undefined // cleanup
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Erro ao buscar notificações' });
    }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        await prisma.notificationRead.upsert({
            where: {
                userId_notificationId: {
                    userId,
                    notificationId: id
                }
            },
            update: {},
            create: {
                userId,
                notificationId: id
            }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Erro ao marcar notificação como lida' });
    }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                company: { select: { id: true, name: true } }
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar usuários' });
    }
});

app.post('/api/admin/users', authenticateAdmin, async (req, res) => {
    const { email, password, companyName, role } = req.body;

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(400).json({ message: 'Email já cadastrado' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const company = await prisma.company.create({ data: { name: companyName || 'Nova Empresa' } });

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role: role || 'USER',
                companyId: company.id
            }
        });

        res.json({ success: true, user: { id: user.id, email: user.email } });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ message: 'Erro ao criar usuário' });
    }
});

app.put('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { password, role, companyName } = req.body;

    try {
        const updates = {};
        if (password) updates.password = await bcrypt.hash(password, 10);
        if (role) updates.role = role;

        if (Object.keys(updates).length > 0) {
            await prisma.user.update({
                where: { id },
                data: updates
            });
        }

        if (companyName) {
            const user = await prisma.user.findUnique({ where: { id } });
            await prisma.company.update({
                where: { id: user.companyId },
                data: { name: companyName }
            });
        }

        res.json({ success: true, message: 'Usuário atualizado' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar usuário' });
    }
});

app.post('/api/admin/users/:id/lead-credits', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { credits } = req.body;
    
    try {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
        
        await prisma.company.update({
            where: { id: user.companyId },
            data: { leadSearchBalance: { increment: parseInt(credits) } }
        });
        
        res.json({ success: true, message: 'Créditos inseridos com sucesso' });
    } catch (error) {
        console.error('Error adding credits:', error);
        res.status(500).json({ message: 'Erro ao inserir créditos' });
    }
});

// --- Configuration Routes (Protected) ---

// Helper to get config from DB

const getCompanyConfig = async (companyId, agentId = null) => {
    if (!companyId) return null;

    try {
        let whereClause = { companyId };
        if (agentId) whereClause.id = agentId;

        const config = await prisma.agentConfig.findFirst({
            where: whereClause,
            include: {
                company: {
                    include: {
                        specialists: { where: { active: true } },
                        appointmentTypes: { where: { active: true } },
                        googleConfig: true
                    }
                }
            }
        });

        if (!config) return null;

        // SAFE PARSING (JSON.parse CAN THROW if invalid JSON string)
        const safeParse = (str) => {
            try { return str ? JSON.parse(str) : undefined; } catch (e) { return undefined; }
        };

        const parsedCatalogConfig = safeParse(config.catalogConfig);
        let products = safeParse(config.products) || [];

        // Filter out legacy XML products saved directly in AgentConfig to avoid duplicates
        // with the new dynamic loading system.
        products = products.filter(p => !p.xmlSourceId);

        // Fetch products from independent XML sources linked to this agent
        if (parsedCatalogConfig && Array.isArray(parsedCatalogConfig.xmlSources) && parsedCatalogConfig.xmlSources.length > 0) {
            try {
                const xmlSources = await prisma.xmlCatalogSource.findMany({
                    where: {
                        id: { in: parsedCatalogConfig.xmlSources },
                        companyId: companyId
                    },
                    select: { products: true, id: true, name: true }
                });

                xmlSources.forEach(source => {
                    if (source.products) {
                        try {
                            const sourceProducts = JSON.parse(source.products);
                            if (Array.isArray(sourceProducts)) {
                                // Add source info to products for traceability
                                const enriched = sourceProducts.map(p => ({ ...p, xmlSourceId: source.id, xmlSourceName: source.name }));
                                products = [...products, ...enriched];
                            }
                        } catch (e) {
                            console.error(`[Config] Error parsing products for XML source ${source.id}:`, e);
                        }
                    }
                });
            } catch (error) {
                console.error(`[Config] Error fetching XML sources for agent ${agentId}:`, error);
            }
        }

        return {
            ...config,
            persona: safeParse(config.persona),
            integrations: safeParse(config.integrations),
            products: products,
            knowledgeBase: safeParse(config.knowledgeBase),
            followUpConfig: safeParse(config.followUpConfig),
            catalogConfig: parsedCatalogConfig,
            transferConfig: safeParse(config.transferConfig),
            reactionConfig: safeParse(config.reactionConfig),
            specialists: config.company?.specialists || [],
            appointmentTypes: config.company?.appointmentTypes || [],
            googleConfig: config.company?.googleConfig || null,
            // Fallback to Global Promp credentials if agent doesn't have them
            prompIdentity: config.prompIdentity || config.company?.prompIdentity,
            prompUuid: config.prompUuid || config.company?.prompUuid,
            prompToken: config.prompToken || config.company?.prompToken
        };
    } catch (error) {
        console.error(`[Config] Error fetching config for ${companyId}:`, error);
        return null; // Return null instead of crashing
    }
};


const scrapeUrl = async (url) => {
    try {
        console.log(`[Scraper] Fetching ${url}...`);
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return `[Erro ao ler ${url}: ${response.statusText}]`;
        const html = await response.text();

        // Simple regex-based extraction (Body text)
        // Remove scripts, styles, tags
        let text = html
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
            .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return text.substring(0, 5000) + (text.length > 5000 ? "..." : ""); // Limit size
    } catch (e) {
        console.error(`[Scraper] Failed to scrape ${url}:`, e);
        return `[Erro ao ler ${url}]`;
    }
};

app.post('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const newConfig = req.body;

    // DEBUG: Log incoming config update
    if (newConfig.products) {
        console.log(`[Config Update] Received ${newConfig.products.length} products to save.`);
    } else {
        console.log('[Config Update] No products array in payload.');
    }

    try {
        const agentId = newConfig.agentId;
        let whereClause = { companyId };
        if (agentId) whereClause.id = agentId;
        
        const currentConfig = await prisma.agentConfig.findFirst({ where: whereClause });

        // Merge Voice settings into Integrations
        let combinedIntegrations = {};
        let currentIntegrations = {};

        try {
            if (currentConfig && currentConfig.integrations) {
                currentIntegrations = typeof currentConfig.integrations === 'string'
                    ? JSON.parse(currentConfig.integrations)
                    : currentConfig.integrations;
            }
        } catch (e) {
            console.error('[Config Update] Error parsing current integrations:', e);
        }

        try {
            if (newConfig.integrations) {
                const incoming = typeof newConfig.integrations === 'string'
                    ? JSON.parse(newConfig.integrations)
                    : newConfig.integrations;
                // Merge with existing
                combinedIntegrations = { ...currentIntegrations, ...incoming };
            } else {
                // Keep existing (don't wipe)
                combinedIntegrations = { ...currentIntegrations };
            }
        } catch (e) {
            console.error('[Config Update] Error parsing new integrations:', e);
            combinedIntegrations = { ...currentIntegrations };
        }

        if (newConfig.voice) {
            combinedIntegrations = { ...combinedIntegrations, ...newConfig.voice };
        }

        // DEBUG: Log key update
        if (combinedIntegrations.openaiKey) {
            const k = combinedIntegrations.openaiKey;
            const masked = k.length > 10 ? k.substring(0, 8) + '...' + k.substring(k.length - 4) : '***';
            console.log(`[Config Update] Saving openaiKey: ${masked}`);
        } else {
            console.log('[Config Update] No openaiKey in integrations payload (and not in DB).');
        }

        // Handle Knowledge Base - SCRAPE LINKS
        // Only process if provided in request to avoid overwriting with empty
        let finalKB = undefined;
        if (newConfig.knowledgeBase) {
            finalKB = newConfig.knowledgeBase;
            if (finalKB.links && finalKB.links.length > 0) {
                const processedLinks = await Promise.all(finalKB.links.map(async (link) => {
                    let url = typeof link === 'string' ? link : link.url;
                    let existingContent = typeof link === 'object' ? link.content : '';

                    // Skip scraping if we already have content (prevent timeout on save)
                    if (existingContent && existingContent.length > 50) {
                        return { url, content: existingContent };
                    }

                    // Scrape content to ensure freshness (only if missing or short)
                    let content = await scrapeUrl(url);
                    return { url, content };
                }));
                finalKB.links = processedLinks;
            }
        }

        // DEBUG: Validate Persona
        if (newConfig.persona) {
            console.log(`[Config Update] Persona Type: ${typeof newConfig.persona}`);
            if (typeof newConfig.persona === 'string') {
                console.log(`[Config Update] Persona Content (Head): ${newConfig.persona.substring(0, 50)}`);
            }
        }

        // 🔥 MULTI-TENANT FIX: Add companyId to each product
        // This ensures products are properly isolated per company
        let productsToSave = newConfig.products;
        if (productsToSave && Array.isArray(productsToSave)) {
            productsToSave = productsToSave.map(product => ({
                ...product,
                companyId: companyId // Ensure every product has companyId
            }));
            console.log(`[Config Update] Added companyId to ${productsToSave.length} products`);
        }

        const data = {
            companyId,
            systemPrompt: newConfig.systemPrompt,
            persona: newConfig.persona ? (typeof newConfig.persona === 'object' ? JSON.stringify(newConfig.persona) : newConfig.persona) : undefined,
            integrations: JSON.stringify(combinedIntegrations),
            products: productsToSave ? JSON.stringify(productsToSave) : undefined,
            knowledgeBase: finalKB ? JSON.stringify(finalKB) : undefined,
            followUpConfig: newConfig.followUpConfig ? (typeof newConfig.followUpConfig === 'object' ? JSON.stringify(newConfig.followUpConfig) : newConfig.followUpConfig) : undefined,
            catalogConfig: newConfig.catalogConfig ? (typeof newConfig.catalogConfig === 'object' ? JSON.stringify(newConfig.catalogConfig) : newConfig.catalogConfig) : undefined,
            transferConfig: newConfig.transferConfig ? (typeof newConfig.transferConfig === 'object' ? JSON.stringify(newConfig.transferConfig) : newConfig.transferConfig) : undefined,
            reactionConfig: newConfig.reactionConfig ? (typeof newConfig.reactionConfig === 'object' ? JSON.stringify(newConfig.reactionConfig) : newConfig.reactionConfig) : undefined
        };

        
        let updatedConfig = await prisma.agentConfig.findFirst({ where: whereClause });
        if (updatedConfig) {
            updatedConfig = await prisma.agentConfig.update({ where: { id: updatedConfig.id }, data });
        } else {
            updatedConfig = await prisma.agentConfig.create({ data });
        }
    

        // Save History if systemPrompt changed
        // Check if currentConfig exists to avoid null reference
        if (currentConfig && currentConfig.systemPrompt !== newConfig.systemPrompt && newConfig.systemPrompt && currentConfig.systemPrompt) {
            await prisma.promptHistory.create({
                data: {
                    agentConfigId: updatedConfig.id,
                    systemPrompt: currentConfig.systemPrompt
                }
            });
        }

        res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
        console.error('Error saving config (FULL):', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ success: false, message: 'Failed to save configuration: ' + error.message });
    }
});

app.get('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const agentId = req.query.agentId; // Allow fetching specific agent
    try {
        const config = await getCompanyConfig(companyId, agentId);
        res.json(config || {});
    } catch (error) {
        console.error('Error fetching config:', error);
        res.status(500).json({ message: 'Error fetching config' });
    }
});

// --- PROMP EXTERNAL LISTINGS (FOR FRONTEND) ---
app.get('/api/promp/users', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const agentId = req.query.agentId;
    try {
        const config = await getCompanyConfig(companyId, agentId);
        if (!config || (!config.prompUuid && !config.prompIdentity)) return res.status(404).json({ error: 'Configuração do Promp incompleta' });
        const users = await getPrompUsers(config);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Promp users' });
    }
});

app.get('/api/promp/queues', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const agentId = req.query.agentId;
    try {
        const config = await getCompanyConfig(companyId, agentId);
        if (!config || (!config.prompUuid && !config.prompIdentity)) return res.status(404).json({ error: 'Configuração do Promp incompleta' });
        const queues = await getPrompQueues(config);
        res.json(queues);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Promp queues' });
    }
});

// --- GLOBAL CONFIG API (ADMIN) ---
app.post('/api/admin/config', authenticateToken, async (req, res) => {
    try {
        const {
            openaiKey,
            geminiKey,
            elevenLabsKey,
            elevenLabsVoiceId,
            googleClientId,
            googleClientSecret,
            googleRedirectUri,
            googleMapsApiKey,
            googlePlacesSearchRadius,
            asaasKey,
            asaasWebhookToken,
            asaasPaymentLink
        } = req.body;

        console.log('[GlobalConfig] Received Payload:', JSON.stringify(req.body, null, 2));

        const existing = await prisma.globalConfig.findFirst();

        const data = {
            openaiKey,
            geminiKey,
            elevenLabsKey,
            elevenLabsVoiceId,
            googleClientId,
            googleClientSecret,
            googleRedirectUri,
            googleMapsApiKey,
            googlePlacesSearchRadius: googlePlacesSearchRadius ? parseInt(googlePlacesSearchRadius) : 5000,
            asaasKey,
            asaasWebhookToken,
            asaasPaymentLink
        };

        if (existing) {
            await prisma.globalConfig.update({
                where: { id: existing.id },
                data
            });
        } else {
            await prisma.globalConfig.create({ data });
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Error saving global config:', e);
        res.status(500).json({ error: 'Failed to save global config' });
    }
});
// --- VOICE MODEL MANAGEMENT (Admin CRUD) ---

// List all voice models
app.get('/api/admin/voices', authenticateToken, async (req, res) => {
    try {
        const voices = await prisma.voiceModel.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(voices);
    } catch (e) {
        console.error('Error fetching voices:', e);
        res.status(500).json({ error: 'Failed to fetch voices' });
    }
});

// Add a new voice model
app.post('/api/admin/voices', authenticateToken, async (req, res) => {
    try {
        const { voiceId, name, gender, previewUrl } = req.body;
        if (!voiceId || !name || !gender) {
            return res.status(400).json({ error: 'voiceId, name and gender are required' });
        }
        const voice = await prisma.voiceModel.create({
            data: { voiceId, name, gender, previewUrl: previewUrl || null }
        });
        res.json(voice);
    } catch (e) {
        console.error('Error creating voice:', e);
        res.status(500).json({ error: 'Failed to create voice' });
    }
});

// Delete a voice model
app.delete('/api/admin/voices/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.voiceModel.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting voice:', e);
        res.status(500).json({ error: 'Failed to delete voice' });
    }
});

// Public (authenticated) endpoint for user voice selection
app.get('/api/voices', authenticateToken, async (req, res) => {
    try {
        const voices = await prisma.voiceModel.findMany({
            orderBy: [{ gender: 'asc' }, { name: 'asc' }]
        });
        res.json(voices);
    } catch (e) {
        console.error('Error fetching voices:', e);
        res.status(500).json({ error: 'Failed to fetch voices' });
    }
});

// Voice Preview — Generate sample audio using ElevenLabs TTS (cached 24h)
const voicePreviewCache = new Map();
const VOICE_PREVIEW_TTL = 24 * 60 * 60 * 1000;

app.get('/api/voices/:voiceId/preview', authenticateToken, async (req, res) => {
    const { voiceId } = req.params;
    try {
        // Check cache first
        const cached = voicePreviewCache.get(voiceId);
        if (cached && (Date.now() - cached.timestamp < VOICE_PREVIEW_TTL)) {
            return res.json({ audio: cached.audio });
        }

        // Get ElevenLabs API Key from GlobalConfig
        const globalConfig = await prisma.globalConfig.findFirst();
        const apiKey = globalConfig?.elevenLabsKey;
        if (!apiKey) {
            return res.status(400).json({ error: 'ElevenLabs API Key não configurada.' });
        }

        const sampleText = 'Olá! Eu sou a voz do seu assistente virtual. Como posso ajudar você hoje?';

        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            data: {
                text: sampleText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            },
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
        });

        const audioBase64 = Buffer.from(response.data).toString('base64');

        // Cache result
        voicePreviewCache.set(voiceId, { audio: audioBase64, timestamp: Date.now() });

        // Cleanup old cache entries
        if (voicePreviewCache.size > 50) {
            const now = Date.now();
            for (const [key, val] of voicePreviewCache.entries()) {
                if (now - val.timestamp > VOICE_PREVIEW_TTL) voicePreviewCache.delete(key);
            }
        }

        res.json({ audio: audioBase64 });
    } catch (e) {
        console.error(`[VoicePreview] Error generating preview for ${voiceId}:`, e.response?.data ? JSON.stringify(e.response.data) : e.message);
        res.status(500).json({ error: 'Falha ao gerar preview da voz.' });
    }
});

// --- LEAD FINDER API ---

// In-memory cache for lead searches (24h TTL)
const leadSearchCache = new Map();
const LEAD_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Helper: sleep for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test Google Maps API Connection
app.post('/api/leads/test-connection', authenticateToken, async (req, res) => {
    try {
        const globalConfig = await prisma.globalConfig.findFirst();
        const apiKey = globalConfig?.googleMapsApiKey;
        if (!apiKey) {
            return res.json({ success: false, error: 'Google Maps API Key não configurada. Vá em Config Global para definir.' });
        }

        // Simple test: Geocode a known location
        const testUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=São+Paulo,+Brasil&key=${apiKey}`;
        const response = await axios.get(testUrl);

        if (response.data.status === 'OK') {
            return res.json({ success: true, message: 'Conexão com Google Maps API funcionando!' });
        } else {
            return res.json({ success: false, error: `API retornou: ${response.data.status} - ${response.data.error_message || 'Verifique sua chave e permissões.'}` });
        }
    } catch (e) {
        console.error('[LeadFinder] Test Connection Error:', e.message);
        return res.json({ success: false, error: `Erro de conexão: ${e.message}` });
    }
});

// Search Leads via Google Places API (New)
app.post('/api/leads/search', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { segment, region, radius, maxResults } = req.body;

        if (!segment || !region) {
            return res.status(400).json({ error: 'Segmento e região são obrigatórios.' });
        }

        // --- CHECK LIMITS (60 Leads per 7-day Cycle) ---
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { leadSearchBalance: true, createdAt: true }
        });

        if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

        const companyCreatedAt = new Date(company.createdAt);
        const now = new Date();
        const cycleMs = 7 * 24 * 60 * 60 * 1000;
        const diffMs = now.getTime() - companyCreatedAt.getTime();
        const currentCycleStart = new Date(companyCreatedAt.getTime() + (Math.floor(diffMs / cycleMs) * cycleMs));

        // Count leads found in current cycle
        const leadSearches = await prisma.leadSearch.findMany({
            where: {
                companyId,
                createdAt: { gte: currentCycleStart }
            },
            select: { leadsFound: true }
        });

        const usedThisCycle = leadSearches.reduce((acc, curr) => acc + (curr.leadsFound || 0), 0);
        const freeLimit = 60;
        const extraBalance = company.leadSearchBalance || 0;
        const remainingFree = Math.max(0, freeLimit - usedThisCycle);
        const totalAvailable = remainingFree + extraBalance;

        if (totalAvailable <= 0) {
            return res.status(403).json({
                error: 'LIMIT_REACHED',
                message: 'Você atingiu o limite semanal de 60 leads gratuitos.',
                usedThisCycle,
                freeLimit,
                extraBalance
            });
        }
        // --------------------

        const globalConfig = await prisma.globalConfig.findFirst();
        const apiKey = globalConfig?.googleMapsApiKey;
        if (!apiKey) {
            return res.status(400).json({ error: 'Google Maps API Key não configurada. Configure em Config Global.' });
        }

        const searchRadius = radius || globalConfig?.googlePlacesSearchRadius || 5000;
        const maxLeads = Math.min(maxResults || 20, 60);

        // Check cache
        const cacheKey = `${segment}_${region}_${searchRadius}_${maxLeads}`.toLowerCase().replace(/\s+/g, '_');
        const cached = leadSearchCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < LEAD_CACHE_TTL)) {
            console.log(`[LeadFinder] Cache HIT for: ${cacheKey}`);
            return res.json({ leads: cached.data, fromCache: true, cachedAt: new Date(cached.timestamp).toISOString() });
        }

        console.log(`[LeadFinder] Searching: segment="${segment}", region="${region}", radius=${searchRadius}m, max=${maxLeads}`);

        // Step 1: Geocoding - Convert region to lat/lng
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(region)}&key=${apiKey}`;
        const geocodeRes = await axios.get(geocodeUrl);

        if (geocodeRes.data.status !== 'OK' || !geocodeRes.data.results.length) {
            const errMsg = geocodeRes.data.status === 'ZERO_RESULTS'
                ? `Região "${region}" não encontrada. Tente um nome mais específico (ex: "São Paulo, SP, Brasil").`
                : `Erro no Geocoding: ${geocodeRes.data.status}`;
            return res.status(400).json({ error: errMsg });
        }

        const { lat, lng } = geocodeRes.data.results[0].geometry.location;
        console.log(`[LeadFinder] Geocoded "${region}" -> lat=${lat}, lng=${lng}`);

        // Step 2: Places Text Search (New API) — returns details in one call!
        // The new API uses POST with JSON body and headers instead of query params
        const fieldMask = [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.nationalPhoneNumber',
            'places.internationalPhoneNumber',
            'places.websiteUri',
            'places.rating',
            'places.userRatingCount',
            'places.businessStatus',
            'places.currentOpeningHours',
            'places.googleMapsUri'
        ].join(',');

        let allPlaces = [];
        let pageToken = null;
        let pageCount = 0;

        do {
            const requestBody = {
                textQuery: `${segment} em ${region}`,
                languageCode: 'pt-BR',
                maxResultCount: Math.min(maxLeads - allPlaces.length, 20), // Max 20 per request
                locationBias: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: searchRadius * 1.0
                    }
                }
            };

            // If we have a page token from a previous request, use it
            if (pageToken) {
                requestBody.pageToken = pageToken;
            }

            console.log(`[LeadFinder] Text Search (New API) page ${pageCount + 1}, requesting ${requestBody.maxResultCount} results`);

            const placesRes = await axios.post(
                'https://places.googleapis.com/v1/places:searchText',
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask': fieldMask
                    }
                }
            );

            if (placesRes.data.places && placesRes.data.places.length > 0) {
                allPlaces = allPlaces.concat(placesRes.data.places);
                console.log(`[LeadFinder] Got ${placesRes.data.places.length} results (total: ${allPlaces.length})`);
            }

            // Check if there's a next page token
            pageToken = placesRes.data.nextPageToken || null;
            pageCount++;

            // Safety: max 3 pages to avoid runaway requests
            if (pageCount >= 3) break;

            // Small delay before next page
            if (pageToken && allPlaces.length < maxLeads) {
                await sleep(500);
            }

        } while (pageToken && allPlaces.length < maxLeads);

        // Trim to maxResults
        allPlaces = allPlaces.slice(0, maxLeads);

        if (allPlaces.length === 0) {
            return res.json({ leads: [], message: `Nenhum resultado encontrado para "${segment}" em "${region}".` });
        }

        console.log(`[LeadFinder] Processing ${allPlaces.length} results...`);

        // Step 3: Map results to our lead format (no separate Details call needed!)
        const leads = allPlaces.map((place, index) => {
            return {
                id: place.id || `lead_${index}`,
                name: place.displayName?.text || 'N/A',
                address: place.formattedAddress || 'N/A',
                phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
                website: place.websiteUri || '',
                rating: place.rating || 0,
                totalRatings: place.userRatingCount || 0,
                status: place.businessStatus || 'UNKNOWN',
                isOpen: place.currentOpeningHours?.openNow ?? null,
                googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`
            };
        });

        // Store in cache
        leadSearchCache.set(cacheKey, { data: leads, timestamp: Date.now() });

        // Clean old cache entries periodically
        if (leadSearchCache.size > 100) {
            const now = Date.now();
            for (const [key, val] of leadSearchCache.entries()) {
                if (now - val.timestamp > LEAD_CACHE_TTL) leadSearchCache.delete(key);
            }
        }

        console.log(`[LeadFinder] Returning ${leads.length} leads for "${segment}" in "${region}"`);

        // Record Search & Update Balance
        const leadsCount = leads.length;
        await prisma.leadSearch.create({
            data: { 
                companyId,
                leadsFound: leadsCount
            }
        });

        if (leadsCount > remainingFree) {
            const extraUsed = leadsCount - remainingFree;
            await prisma.company.update({
                where: { id: companyId },
                data: { leadSearchBalance: { decrement: extraUsed } }
            });
            console.log(`[LeadFinder] Used ${extraUsed} extra lead credits for Company ${companyId}`);
        }

        res.json({ leads, fromCache: false });

    } catch (e) {
        console.error('[LeadFinder] Search Error:', e.response?.data || e.message);

        // Handle specific Google API errors
        const googleError = e.response?.data?.error;
        if (googleError) {
            const status = googleError.status || '';
            const message = googleError.message || '';

            if (status === 'PERMISSION_DENIED' || message.includes('not enabled')) {
                return res.status(403).json({ error: `API Negada: ${message}. Verifique se a Places API (New) está habilitada no Google Cloud Console.` });
            }
            if (status === 'RESOURCE_EXHAUSTED') {
                return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente mais tarde.' });
            }
            return res.status(400).json({ error: `Erro da API Google: ${message}` });
        }

        res.status(500).json({ error: `Erro interno na busca: ${e.message}` });
    }
});

// Create Asaas Charge for Lead Finder
app.post('/api/payments/asaas/create-charge', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const config = await getGlobalConfig();

        if (!config?.asaasKey) {
            return res.status(400).json({ error: 'Configuração do Asaas (API Key) não encontrada.' });
        }

        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });
        
        console.log(`[Asaas] Creating charge for Company: ${companyId} (${company.name})`);

        let asaasCustomerId = company.asaasCustomerId;

        // Se não tiver Customer ID, cria um no Asaas
        if (!asaasCustomerId) {
            try {
                console.log(`[Asaas] Creating new Customer for: ${company.name}`);
                const customerResponse = await axios.post('https://www.asaas.com/api/v3/customers', {
                    name: company.name,
                    externalReference: companyId
                }, {
                    headers: { 'access_token': config.asaasKey }
                });
                
                asaasCustomerId = customerResponse.data.id;

                // Salva o ID no banco para futuras cobranças
                await prisma.company.update({
                    where: { id: companyId },
                    data: { asaasCustomerId }
                });
            } catch (custError) {
                console.error('[Asaas] Customer Creation Error:', custError.response?.data || custError.message);
                return res.status(500).json({ error: 'Erro ao cadastrar cliente no Asaas.' });
            }
        }

        const asaasUrl = 'https://www.asaas.com/api/v3/payments';

        const response = await axios.post(asaasUrl, {
            customer: asaasCustomerId, 
            billingType: 'UNDEFINED', // Permite Cartão ou Pix
            value: 19.90,
            dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            description: `Recarga Lead Finder (+3) - ${company.name}`,
            externalReference: companyId,
            postalService: false
        }, {
            headers: { 'access_token': config.asaasKey }
        });

        res.json({ invoiceUrl: response.data.invoiceUrl });
    } catch (e) {
        console.error('[Asaas] Create Charge Error:', e.response?.data || e.message);
        const errorMsg = e.response?.data?.errors?.[0]?.description || 'Falha ao gerar cobrança no Asaas.';
        res.status(500).json({ error: errorMsg });
    }
});

// Asaas Webhook for Payment Confirmation
app.post('/api/webhooks/asaas', async (req, res) => {
    try {
        const payload = req.body;
        const event = payload.event;
        const companyId = payload.payment?.externalReference;
        const tokenReceived = req.headers['asaas-access-token'];

        console.log(`[Asaas Webhook] Event: ${event}, Company: ${companyId}`);

        const config = await getGlobalConfig();
        if (config?.asaasWebhookToken && tokenReceived !== config.asaasWebhookToken) {
            console.warn('[Asaas Webhook] Invalid Token Received');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
            let targetCompanyId = companyId;

            // Se não tiver companyId (Payment Link estático), buscar pelo e-mail do cliente
            if (!targetCompanyId && payload.payment?.customer && config?.asaasKey) {
                try {
                    const customerId = payload.payment.customer;
                    console.log(`[Asaas Webhook] No externalRef. Fetching customer ${customerId} data...`);
                    
                    const custRes = await axios.get(`https://www.asaas.com/api/v3/customers/${customerId}`, {
                        headers: { 'access_token': config.asaasKey }
                    });

                    const email = custRes.data.email;
                    if (email) {
                        const user = await prisma.user.findFirst({
                            where: { email: email.toLowerCase() },
                            select: { companyId: true }
                        });
                        
                        if (user) {
                            targetCompanyId = user.companyId;
                            console.log(`[Asaas Webhook] Found company for email ${email}: ${targetCompanyId}`);
                        }
                    }
                } catch (err) {
                    console.error('[Asaas Webhook] Error fetching customer email:', err.message);
                }
            }

            if (targetCompanyId) {
                await prisma.company.update({
                    where: { id: targetCompanyId },
                    data: { leadSearchBalance: { increment: 60 } }
                });
                console.log(`[Asaas Webhook] Success: Added 60 lead credits to Company ${targetCompanyId}`);
            } else {
                console.warn('[Asaas Webhook] No company identified for this payment');
            }
        }

        res.json({ received: true });
    } catch (e) {
        console.error('[Asaas Webhook] Error:', e.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get Lead Finder Usage Stats
app.get('/api/leads/stats', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { leadSearchBalance: true, createdAt: true }
        });

        if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

        // Lead Cycle Logic (7 Days)
        const companyCreatedAt = new Date(company.createdAt);
        const now = new Date();
        const cycleMs = 7 * 24 * 60 * 60 * 1000;
        const diffMs = now.getTime() - companyCreatedAt.getTime();
        const currentCycleStartMs = companyCreatedAt.getTime() + (Math.floor(diffMs / cycleMs) * cycleMs);
        const currentCycleStart = new Date(currentCycleStartMs);
        const nextReset = new Date(currentCycleStartMs + cycleMs);

        // Count leads found in current cycle
        const leadSearches = await prisma.leadSearch.findMany({
            where: {
                companyId,
                createdAt: { gte: currentCycleStart }
            },
            select: { leadsFound: true }
        });

        const leadsUsedThisCycle = leadSearches.reduce((acc, curr) => acc + (curr.leadsFound || 0), 0);
        const freeLimit = 60;
        const extraBalance = company.leadSearchBalance || 0;
        const remainingFree = Math.max(0, freeLimit - leadsUsedThisCycle);
        const totalAvailable = remainingFree + extraBalance;

        const config = await getGlobalConfig();

        res.json({
            leadsUsedThisCycle,
            freeLimit,
            extraBalance,
            totalAvailable,
            nextReset: nextReset.toISOString(),
            isBlocked: totalAvailable <= 0,
            paymentLink: config?.asaasPaymentLink || null
        });
    } catch (e) {
        console.error('[LeadFinder] Stats Error:', e.message);
        res.status(500).json({ error: 'Falha ao buscar estatísticas do Lead Finder' });
    }
});

app.get('/api/admin/config', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.globalConfig.findFirst();
        res.json(config || {});
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete global config' });
    }
});

// Helper
const getGlobalConfig = async () => {
    return await prisma.globalConfig.findFirst();
};


// --- GOOGLE CALENDAR & SCHEDULING ROUTES ---

// 1. OAuth: Get Auth URL
app.get('/api/auth/google/url', authenticateToken, async (req, res) => {
    try {
        const url = await generateAuthUrl(req.user.companyId);
        res.json({ url });
    } catch (error) {
        console.error('Google Auth URL Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. OAuth: Callback
// 2. OAuth: Callback
app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        let companyId = null;
        try { companyId = JSON.parse(state).companyId; } catch (_) { }

        if (!code || !companyId) {
            return res.status(400).send('Invalid request: Missing Code or State (CompanyId)');
        }

        const tokens = await handleOAuthCallback(code);

        // Save tokens for company
        await prisma.googleCalendarConfig.upsert({
            where: { companyId },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            },
            create: {
                companyId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            }
        });

        // Redirect back to frontend
        // Assuming frontend is at root/scheduling or similar
        res.redirect('/scheduling?success=true');

    } catch (error) {
        console.error('Google Auth Callback Error:', error);
        res.status(500).send(`Authentication Failed: ${error.message}`);
    }
});

app.post('/api/auth/google/callback', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        const tokens = await handleOAuthCallback(code);

        // Save tokens for company
        await prisma.googleCalendarConfig.upsert({
            where: { companyId: req.user.companyId },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            },
            create: {
                companyId: req.user.companyId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Google Auth Callback Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Calendar: List Calendars
app.get('/api/calendar/list', authenticateToken, async (req, res) => {
    try {
        const calendars = await listCalendars(req.user.companyId);
        res.json(calendars);
    } catch (error) {
        // If config doesn't exist, return empty or specific error code
        if (error.message.includes('not connected')) {
            return res.status(404).json({ error: 'Not connected' });
        }
        res.status(500).json({ error: error.message });
    }
});

// 4. Calendar: Save Settings (Primary Calendar, etc)
app.post('/api/calendar/settings', authenticateToken, async (req, res) => {
    try {
        const { primaryCalendarId, timezone, officeHours, reminderBefore } = req.body;
        await prisma.googleCalendarConfig.update({
            where: { companyId: req.user.companyId },
            data: {
                primaryCalendarId,
                timezone,
                officeHours: officeHours ? JSON.stringify(officeHours) : undefined,
                reminderBefore
            }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Calendar: Get Config
app.get('/api/calendar/config', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.googleCalendarConfig.findUnique({
            where: { companyId: req.user.companyId }
        });

        let parsedOfficeHours = null;
        if (config?.officeHours) {
            try { parsedOfficeHours = JSON.parse(config.officeHours); } catch (e) { }
        }

        res.json({ ...config, officeHours: parsedOfficeHours });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SPECIALISTS & APPOINTMENT TYPES ---

// Specialists
app.get('/api/specialists', authenticateToken, async (req, res) => {
    const specialists = await prisma.specialist.findMany({ where: { companyId: req.user.companyId } });
    res.json(specialists);
});

app.post('/api/specialists', authenticateToken, async (req, res) => {
    const { name, phone, email, calendarId, active, typeIds } = req.body;

    // Manage relation with AppointmentType if needed (Using connect)
    // For now simple create
    const specialist = await prisma.specialist.create({
        data: {
            companyId: req.user.companyId,
            name, phone, email, calendarId, active
        }
    });

    // If typeIds provided, connect (Manual many-to-many or implicit?)
    // Prisma implicit many-to-many:
    if (typeIds && typeIds.length > 0) {
        await prisma.specialist.update({
            where: { id: specialist.id },
            data: {
                appointmentTypes: {
                    connect: typeIds.map(id => ({ id }))
                }
            }
        });
    }

    res.json(specialist);
});

app.put('/api/specialists/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, calendarId, active, typeIds } = req.body;

    const data = { name, phone, email, calendarId, active };

    if (typeIds) {
        data.appointmentTypes = {
            set: typeIds.map(tid => ({ id: tid }))
        };
    }

    const specialist = await prisma.specialist.update({
        where: { id },
        data
    });
    res.json(specialist);
});

app.delete('/api/specialists/:id', authenticateToken, async (req, res) => {
    await prisma.specialist.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});


// Appointment Types
app.get('/api/appointment-types', authenticateToken, async (req, res) => {
    const types = await prisma.appointmentType.findMany({
        where: { companyId: req.user.companyId },
        include: { specialists: true } // Include to see who is assigned
    });
    res.json(types);
});

app.post('/api/appointment-types', authenticateToken, async (req, res) => {
    const { name, description, duration, color, active } = req.body;
    const type = await prisma.appointmentType.create({
        data: {
            companyId: req.user.companyId,
            name, description, duration: parseInt(duration), color, active
        }
    });
    res.json(type);
});

app.put('/api/appointment-types/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, description, duration, color, active } = req.body;
    const type = await prisma.appointmentType.update({
        where: { id },
        data: { name, description, duration: parseInt(duration), color, active }
    });
    res.json(type);
});

app.delete('/api/appointment-types/:id', authenticateToken, async (req, res) => {
    await prisma.appointmentType.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});

// --- BOOKING LOGIC FOR AI ---

// Check Availability
app.post('/api/appointments/availability', authenticateToken, async (req, res) => {
    // This is for AI or testing
    const { date, specialistId, typeId } = req.body; // date YYYY-MM-DD

    // We need to determine "Start" and "End" of the day to query Google
    // Then filter by "Office Hours" and "Slots"

    try {
        const config = await prisma.googleCalendarConfig.findUnique({ where: { companyId: req.user.companyId } });
        if (!config) return res.status(400).json({ error: 'Calendar not configured' });

        // 1. Duration
        let duration = 30; // default
        if (typeId) {
            const type = await prisma.appointmentType.findUnique({ where: { id: typeId } });
            if (type) duration = type.duration;
        }

        // 2. Query Day Range (UTC or Local?)
        // Input: "2023-10-25"
        // We need to convert to ISO for Google
        const timeZone = config.timezone || 'America/Sao_Paulo';
        const startDay = `${date}T00:00:00Z`; // Approximation, better to use date-fns and timezone
        const endDay = `${date}T23:59:59Z`;

        const busySlots = await checkAvailability(req.user.companyId, startDay, endDay, timeZone);

        // Simple logic: Return busy slots so frontend/AI can compute free slots OR compute here.
        // For AI, it's better to return a list of "Available Slots".

        res.json({ busy: busySlots, duration, timeZone });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// Book Appointment
app.post('/api/appointments/book', authenticateToken, async (req, res) => {
    const {
        specialistId,
        typeId,
        startTime, // ISO
        customerName,
        customerPhone,
        notes
    } = req.body;

    try {
        // 1. Get Details for Google Event
        let summary = "Agendamento";
        let duration = 30;

        if (typeId) {
            const type = await prisma.appointmentType.findUnique({ where: { id: typeId } });
            if (type) {
                summary = `${type.name} - ${customerName}`;
                duration = type.duration;
            }
        }

        const start = new Date(startTime);
        const end = new Date(start.getTime() + duration * 60000);

        // 2. Create on Google
        const googleEvent = await createCalendarEvent(req.user.companyId, {
            summary,
            description: `Cliente: ${customerName}\nTel: ${customerPhone}\nNotas: ${notes || ''}`,
            startTime: start.toISOString(),
            endTime: end.toISOString()
            // Attendees? If specialist has email...
        });

        // 3. Save to DB
        const appointment = await prisma.appointment.create({
            data: {
                companyId: req.user.companyId,
                googleEventId: googleEvent.id,
                customerName,
                customerPhone,
                specialistId,
                typeId,
                startTime: start,
                endTime: end,
                status: 'CONFIRMED',
                notes
            }
        });

        res.json({ success: true, appointment, googleLink: googleEvent.htmlLink });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- REUSABLE CHAT LOGIC ---
const processChatResponse = async (config, message, history, sessionId = null, isAudioInput = false, ticketId = null, tagTriggers = []) => {
    let aiResponse = "";
    let audioBase64 = null;
    let productImageUrl = null;
    let productCaption = "";
    let pdfBase64 = null;
    let pdfName = null;
    let messageChunks = [];

    try {
        // 1. Fetch Global Keys
        const globalConfig = await getGlobalConfig();
        const openaiKey = globalConfig?.openaiKey || process.env.OPENAI_API_KEY;

        if (!openaiKey) {
            console.error('[ProcessChat] Missing OpenAI Key.');
            return { aiResponse: "Erro: Chave de API não configurada.", messageChunks: [] };
        }

        const openai = new OpenAI({ apiKey: openaiKey });

        let systemPrompt = config.systemPrompt || "Você é um assistente virtual útil.";

        // ⚠️ CRITICAL: Product List Freshness - ALWAYS use current list
        systemPrompt = `
🔴 REGRA CRÍTICA #1 - FUNCTION CALLING OBRIGATÓRIO:
═══════════════════════════════════════════════════════════════
⚠️⚠️⚠️ ATENÇÃO IMEDIATA ⚠️⚠️⚠️

VOCÊ NÃO TEM acesso direto à lista de produtos/serviços!

SE o usuário perguntar QUALQUER coisa sobre produtos/serviços:
🚨 VOCÊ DEVE CHAMAR list_available_products() PRIMEIRO
🚨 SEM EXCEÇÃO! NÃO responda sem chamar a function!
🚨 Use APENAS o retorno da function para responder!

GATILHOS OBRIGATÓRIOS (CHAMAR FUNCTION):
- "Quais produtos..."
- "Tem camisas?"
- "Mostrar serviços"
- "Quanto custa [produto]?"  
- "Ver catálogo"
- QUALQUER pergunta sobre produtos/serviços disponíveis

POR QUÊ ISSO É CRÍTICO:
- Os produtos mudam em tempo real
- Listar produtos de memória = DADOS DESATUALIZADOS ❌
- O cliente verá produtos que NÃO EXISTEM MAIS ❌

SEU FLUXO OBRIGATÓRIO:
1️⃣ Usuário pergunta sobre produtos
2️⃣ Você chama list_available_products()
3️⃣ Recebe {total: X, products: [...]}
4️⃣ USA APENAS esse retorno para respon

der
═══════════════════════════════════════════════════════════════

🔴 REGRA CRÍTICA #2 - ESTOQUE EM TEMPO REAL:
═══════════════════════════════════════════════════════════════
A lista de produtos/serviços que você verá MAIS ABAIXO é atualizada
a CADA MENSAGEM para refletir o estoque ATUAL em tempo real.

⚠️ NUNCA confie no histórico de conversa para listar produtos!
⚠️ SEMPRE use a lista que está NESTA mensagem!
⚠️ Se você mencionou "Camisa X" há 5 minutos mas ela NÃO está na 
   lista atual = ELA FOI VENDIDA/REMOVIDA. Não mencione mais!

QUANDO LISTAR PRODUTOS:
1. CONTE quantos tem na lista atual
2. Liste APENAS os que estão na lista atual
3. IGNORE completamente produtos mencionados no histórico

EXEMPLO:
Histórico: "Temos Camisa A, B e C"
Lista atual: Apenas Camisa A e B
Resposta correta: "Temos 2 camisas: A e B"
Resposta ERRADA: "Temos 3 camisas: A, B e C" ❌
═══════════════════════════════════════════════════════════════

` + systemPrompt;

        // Inject Audio Context if applicable
        if (isAudioInput) {
            systemPrompt += `\n\n[SISTEMA]: O usuário enviou uma mensagem de ÁUDIO que foi transcrita automaticamente para texto.
        - O texto começa com "[ÁUDIO TRANSCRITO]:".
        - AJA NATURALMENTE. Não diga "não entendo áudio". Você JÁ recebeu o conteúdo do áudio em texto.
        - Responda de forma HMMMUMANIZADA e CONVERSACIONAL, como uma pessoa real gravando um áudio do WhatsApp.
        - PROIBIDO usar listas, bullet points, asteriscos ou formatações textuais (pois o cliente vai OUVIR sua resposta).
        - Fale de forma fluida, em um único parágrafo coloquial.`;
        }

        // ENFORCE BREVITY & FORMATTING
        systemPrompt += `

DIRETRIZES DE FORMATO E TAMANHO DE RESPOSTA (OBRIGATÓRIO):

Você está respondendo via WhatsApp. Cada mensagem deve parecer escrita por uma pessoa real — curta, direta, sem formatação de documento.

PROIBIDO em qualquer resposta:
- Asteriscos para negrito (**texto**)
- Underlines para itálico (_texto_)
- Hífens ou bullets como lista (- item)
- Títulos ou cabeçalhos de seção
- Respostas maiores que 3 frases seguidas sem pausa

REGRA DO [BREAK]:
Use [BREAK] SOMENTE quando for absolutamente necessário separar dois assuntos distintos.
O padrão deve ser UMA mensagem única, curta e direta.

Exemplo CORRETO (sem [BREAK] — preferido):
"Temos o Basic e o Pro. Qual te interessa?"

Exemplo CORRETO (com [BREAK] — apenas quando necessário):
"Temos dois modelos.[BREAK]O Basic é pra uso casual. O Pro tem mais recursos. Qual você prefere?"

Exemplo ERRADO (não faça isso):
"Prezado cliente, temos os seguintes modelos:
1. Modelo Basic - ideal para uso casual
2. Modelo Pro - com recursos avançados
Qual você prefere?"

Regras de uso do [BREAK]:
- Use [BREAK] no máximo 2 vezes por resposta (máximo 3 mensagens)
- Cada bloco deve ter no máximo 1 a 2 frases curtas
- Prefira sempre caber tudo em uma única mensagem
- O [BREAK] substitui qualquer tipo de lista ou bullet
- NUNCA comece um bloco com número ou traço

DIRETRIZES DE PRODUTOS/SERVIÇOS:
1. NUNCA copie a descrição completa do produto/serviço.
2. LISTAS: Máximo de 3 itens, separados por [BREAK] ou vírgula na mesma mensagem.
3. Se houver mais de 3 itens, cite os 3 principais e pergunte se o cliente quer ver mais.
4. Destaque apenas 2 ou 3 pontos principais (benefícios).

REGRAS CRITICAS SOBRE VARIACOES E DETALHES:
1. [VARIACOES]: Se o item tem variações listadas em "variantItems":
   - Use APENAS as cores e tamanhos informados ali.
   - Diga claramente: "Disponível na cor [COR] no tamanho [TAMANHO]".
   - Se os preços variarem, informe o preço específico daquela variação.

2. [ITEM UNICO]: Se o item NÃO tem variações:
   - Diga que é "Tamanho único" ou "Modelo padrão".
   - PROIBIDO inventar tamanhos P, M, G se não estiverem na lista.

3. PAGAMENTOS E CONDICOES:
   - Informe as formas de pagamento disponíveis (Pix, Cartão, etc).
   - Cite as paymentConditions (ex: "parcelamento em 3x") se presentes.

4. FOTOS DE PRODUTOS (REGRA CRITICA):
   Quando enviar um produto com imagem, coloque TODA a informação relevante (nome, preço, descrição, condições de pagamento, variações) no texto IMEDIATAMENTE ANTES da tag [SHOW_IMAGE: ID].
   Isso faz com que o texto vire a legenda da imagem e tudo seja enviado em UMA ÚNICA MENSAGEM.

   Formato obrigatório:
   [texto completo do produto aqui]
   [SHOW_IMAGE: ID]

   Exemplo CORRETO:
   "Camisa Polo Azul — R$ 89,90
Disponível nos tamanhos P, M e G. Pix com 5% de desconto.
[SHOW_IMAGE: 1234567]"

   Exemplo ERRADO (não faça isso):
   "[SHOW_IMAGE: 1234567]
A camisa está disponível em P, M e G por R$ 89,90."

   NUNCA coloque texto depois de [SHOW_IMAGE]. Todo o conteúdo vai ANTES da tag.
`;

        // Inject Products & Services
        if (config.products && Array.isArray(config.products) && config.products.length > 0) {
            let productList = "";
            config.products.forEach(p => {
                // FILTER INACTIVE (New Feature)
                if (p.active === false) return;

                const isService = p.type === 'service';
                const typeLabel = isService ? 'SERVIÇO' : 'PRODUTO';
                const pdfTag = p.pdf ? `[TEM_PDF] (ID: ${p.id})` : '';
                const paymentLinkCtx = p.hasPaymentLink ? `[TEM_LINK_PAGAMENTO] (Link: ${p.paymentLink})` : '';

                // Unit Logic
                let unitLabel = p.unit || 'Unidade';
                if (p.unit === 'Outro' && p.customUnit) unitLabel = p.customUnit;

                // Price Visibility Logic
                let priceDisplay = `R$ ${p.price}`;
                let priceDetails = "";

                const globalHidePrices = config.catalogConfig?.hidePrices || false;
                if (globalHidePrices) {
                    // If price is hidden, use the reason as the display text
                    let reason = config.catalogConfig?.hidePricesReason || 'Sob consulta';
                    priceDisplay = `[PREÇO_OCULTO: ${reason}]`;
                } else {
                    // Standard Price Logic (Matrix)
                    let activeMethods = p.paymentPrices ? p.paymentPrices.filter(pm => pm.active) : [];

                    if (activeMethods.length > 0) {
                        // Find Min Price among active methods (or base price if specific price is not set)
                        let minPrice = parseFloat(p.price);
                        let cheapestMethod = "Base";

                        let specificPrices = [];

                        activeMethods.forEach(pm => {
                            let methodPrice = pm.price ? parseFloat(pm.price) : parseFloat(p.price);
                            if (!isNaN(methodPrice)) {
                                specificPrices.push(`${pm.label}: R$ ${methodPrice.toFixed(2)}`);
                                if (methodPrice < minPrice) {
                                    minPrice = methodPrice;
                                    cheapestMethod = pm.label;
                                }
                            }
                        });

                        if (minPrice < parseFloat(p.price)) {
                            priceDisplay = `A partir de R$ ${minPrice.toFixed(2)} (no ${cheapestMethod})`;
                        }

                        if (specificPrices.length > 0) {
                            priceDetails = ` [Tabela: ${specificPrices.join(', ')}]`;
                        }
                    }
                }

                // Item Header with Enhanced Price info
                const fileTag = p.attachedFile ? `[TEM_ARQUIVO]` : '';
                const videoTag = p.attachedVideo ? `[TEM_VIDEO]` : '';
                productList += `- [${typeLabel}] ID: ${p.id} | Nome: ${p.name} | Preço: ${priceDisplay} / ${unitLabel}${priceDetails}. ${pdfTag} ${paymentLinkCtx} ${fileTag} ${videoTag}\n`;

                if (p.description) productList += `  Descrição: ${p.description}\n`;
                if (p.paymentConditions) productList += `  Condições: ${p.paymentConditions}\n`;

                // Variations (Only for Products usually, but code handles generically)
                if (p.variantItems && p.variantItems.length > 0) {
                    p.variantItems.forEach(v => {
                        // Check if image exists: prefer variant-specific image, fallback to parent image
                        const varImage = v.image || p.image;
                        const hasImage = !!varImage;
                        // Use variant ID for SHOW_IMAGE when variant has its own image,
                        // otherwise use parent product ID so the resolver falls back correctly
                        const imageInstruction = hasImage
                            ? `[TEM_IMAGEM] ⚠️ USE: [SHOW_IMAGE: ${v.id}]`
                            : '';
                        const varPriceDisplay = globalHidePrices ? priceDisplay : `R$ ${v.price || p.price}`;
                        const varStock = (v.stock !== undefined && v.stock !== null) ? Number(v.stock) : null;
                        const varStockDisplay = varStock !== null ? (varStock > 0 ? `Estoque: ${varStock}` : `SEM ESTOQUE`) : `Estoque: não informado`;
                        productList += `  -- [VARIAÇÃO] ID: ${v.id} | ${v.name || ''} (${v.color || ''} ${v.size || ''}) | ${varPriceDisplay} | ${varStockDisplay} | ${imageInstruction}\n`;
                    });
                } else {
                    // Simple Item - IMAGEM OBRIGATÓRIA
                    const imageInstruction = p.image ? '[TEM_IMAGEM] ⚠️ USE: [SHOW_IMAGE: ' + p.id + ']' : '';
                    const simpleStock = (p.stock !== undefined && p.stock !== null) ? Number(p.stock) : null;
                    const simpleStockDisplay = simpleStock !== null ? (simpleStock > 0 ? `Estoque: ${simpleStock}` : `SEM ESTOQUE`) : `Estoque: não informado`;
                    productList += `  -- [ITEM ÚNICO] ID: ${p.id} | ${simpleStockDisplay} | ${imageInstruction}\n`;
                }
            });

            // ═══════ PROGRAMMATIC PRODUCT COUNTING ═══════
            const productCounts = { produtos: [], servicos: [] };
            config.products.forEach(p => {
                if (p.active !== false) {
                    if (p.type === 'service') {
                        productCounts.servicos.push(p.name);
                    } else {
                        productCounts.produtos.push(p.name);
                    }
                }
            });

            // Build verification header
            let verificationHeader = `
🔴 VERIFICAÇÃO DE ESTOQUE ATUAL (GERADA AUTOMATICAMENTE):
═══════════════════════════════════════════════════════════════
`;
            if (productCounts.produtos.length > 0) {
                verificationHeader += `PRODUTOS: EXATAMENTE ${productCounts.produtos.length} disponíveis:\n`;
                productCounts.produtos.forEach((name, idx) => {
                    verificationHeader += `  ${idx + 1}. ${name}\n`;
                });
            }
            if (productCounts.servicos.length > 0) {
                verificationHeader += `\nSERVIÇOS: EXATAMENTE ${productCounts.servicos.length} disponíveis:\n`;
                productCounts.servicos.forEach((name, idx) => {
                    verificationHeader += `  ${idx + 1}. ${name}\n`;
                });
            }
            verificationHeader += `
⚠️ ATENÇÃO: Você DEVE listar APENAS os itens acima.
⚠️ QUALQUER produto/serviço NÃO listado acima = NÃO EXISTE MAIS
═══════════════════════════════════════════════════════════════

`;

            // Prepend verification header to product list
            productList = verificationHeader + productList;
            // ═══════ END PRODUCT COUNTING ═══════



            systemPrompt += `
═══════════════════════════════════════════════════════════════
🚨 PROTOCOLO CRÍTICO DE ENVIO DE IMAGENS 🚨
═══════════════════════════════════════════════════════════════

GATILHOS: foto, imagem, ver, mostrar, quero ver, tem foto, mostra

REGRA ABSOLUTA (NÃO NEGOCIÁVEL):
Quando o usuário pedir QUALQUER uma dessas palavras:
- "foto", "imagem", "ver", "mostrar", "quero ver", "tem foto"
E o produto tem [TEM_IMAGEM] ou marca ⚠️ USE:

🔴 OBRIGATÓRIO FAZER ISSO:
1️⃣ COPIE a tag [SHOW_IMAGE: ID] que está marcada com ⚠️
2️⃣ COLE ela na sua resposta EXATAMENTE como está
3️⃣ Se não tiver ⚠️, procure o [TEM_IMAGEM] e use o ID que está antes

🚨 MÚLTIPLOS PRODUTOS: Se o cliente pedir fotos de N produtos,
você DEVE incluir N tags [SHOW_IMAGE: ID] diferentes — uma por produto.
NUNCA inclua só a primeira e esqueça o resto.

EXEMPLO CORRETO para "Camisa do Herói" (ID: 1770083712009):
"Aqui está a foto! 👕
[SHOW_IMAGE: 1770083712009]"

EXEMPLO CORRETO para múltiplos produtos pedidos de uma vez:
"Aqui as fotos! 📸

Produto A:
[SHOW_IMAGE: ID_A]

Produto B:
[SHOW_IMAGE: ID_B]"

❌ JAMAIS FAÇA: "Aqui está a foto! 👕" (SEM A TAG)
❌ JAMAIS FAÇA: "Vou enviar a imagem..." (SEM A TAG)
❌ JAMAIS FAÇA: Incluir só 1 SHOW_IMAGE quando o cliente pediu vários produtos

⚠️ ATENÇÃO CRÍTICA: 
Se você ESCREVER que está enviando a foto/imagem MAS não colocar
a tag [SHOW_IMAGE: ID], o cliente ficará SEM VER NADA!
═══════════════════════════════════════════════════════════════

📋 COMO CONSULTAR PRODUTOS/SERVIÇOS:
═══════════════════════════════════════════════════════════════
⚠️ CRÍTICO: NUNCA liste produtos de memória ou histórico!

QUANDO o usuário perguntar sobre produtos/serviços disponíveis:
1️⃣ CHAME a function list_available_products() IMEDIATAMENTE
2️⃣ Use APENAS os produtos retornados pela function
3️⃣ NUNCA invente ou cite produtos que não estão na resposta da function

EXEMPLO CORRETO:
User: "Quais camisas vocês têm?"
AI: [Chama list_available_products(type: "produto")]
Function retorna: {total: 2, products: [{name: "Camisa Engenheiro"}, {name: "Camisa do Herói"}]}
AI: "Temos 2 camisas: Engenheiro e do Herói"

EXEMPLO ERRADO:
User: "Quais camisas vocês têm?"
AI: "Temos 3 camisas: Engenheiro, Herói e Aventureiro" ❌ (NÃO CHAMOU A FUNCTION!)
═══════════════════════════════════════════════════════════════

`;

            systemPrompt += `
📸 USO DOS RESULTADOS DA FUNCTION:
═══════════════════════════════════════════════════════════════
A function list_available_products retorna cada produto com:
- id: Use para tags [SHOW_IMAGE: ID] quando hasImage = true
- hasImage: Se true, o produto tem imagem
- hasVariations: Se true, produto tem variações de cor/tamanho
- stock: Quantidade em estoque (produto simples). Null se tiver variações.
- stockDisplay: Texto formatado do estoque (ex: "307 em estoque" ou "SEM ESTOQUE")
- variantItems: Lista de variações, cada uma com:
    - color: Cor da variação
    - size: Tamanho da variação
    - stock: Quantidade em estoque daquela variação específica
    - stockDisplay: Texto formatado (ex: "1553 em estoque" ou "SEM ESTOQUE")

⚠️ REGRAS DE ESTOQUE:
1. Para produtos COM variações: informe o estoque de CADA variação separadamente.
   Ex: "Rubro: 307 un | Aço: 1553 un | Loteria: 761 un | Marinho: 18 un"
2. Para produtos SIMPLES (sem variações): use o campo stockDisplay do produto.
3. Se stockDisplay for "SEM ESTOQUE", informe ao cliente que não há disponibilidade.
4. Se stockDisplay for "Estoque não informado", NÃO invente quantidade — diga "estoque não disponível".

EXEMPLO DE ESTOQUE:
Function retorna variação: {color: "Rubro", size: "Tam", stock: 307, stockDisplay: "307 em estoque"}
Resposta: "A cor Rubro está disponível com 307 unidades em estoque."
═══════════════════════════════════════════════════════════════

`;

            systemPrompt += `DIRETRIZES DE MÍDIA E VENDAS (CRÍTICO):\n`;
            systemPrompt += `1. IMAGENS: Se o cliente pedir qualquer referência visual, use a tag [SHOW_IMAGE: ID]. (Veja regras de interpretação abaixo).\n`;
            systemPrompt += `2. PDF DE SERVIÇO: Se o cliente pedir detalhes de um serviço com [TEM_PDF], EXPLIQUE o serviço em texto e PERGUNTE: "Gostaria de receber o PDF com mais detalhes?". SE O CLIENTE CONFIRMAR, responda: "[SEND_PDF: ID] Enviando o arquivo...".\n`;
            systemPrompt += `3. PAGAMENTO: Se o cliente quiser comprar/contratar e o item tiver [TEM_LINK_PAGAMENTO], envie o link: "[LINK: URL_DO_PAGAMENTO] Clique aqui para finalizar.".\n`;
            systemPrompt += `4. PREÇO/CONDIÇÕES: Use as informações de preço e condições (se houver) para negociar.\n`;
            systemPrompt += `5. UNIDADES DE MEDIDA (CRÍTICO): Cada produto tem sua própria unidade (Unidade, Kg, Rolo, Metro, etc.). JAMAIS GENERALIZE. Se o Produto A é "Rolo" e o Produto B é "Kg", fale exatamente assim. Nunca diga que "todos são vendidos por rolo". Verifique item por item.\n`;
            systemPrompt += `6. PREÇOS OCULTOS [PREÇO_OCULTO: Motivo]: Se um produto estiver marcado com isso, NÃO INVENTE UM PREÇO. Responda ao cliente explicando o motivo (ex: "O valor é sob consulta", "Preciso verificar com o vendedor"). Se o motivo for "Preço com vendedor", diga que vai chamar um atendente humano.\n`;
            systemPrompt += `7. ARQUIVOS VINCULADOS [TEM_ARQUIVO]: Se o item tem esse marcador, NÃO envie o arquivo imediatamente. Pergunte: "Gostaria de receber o material do produto?". Se o cliente confirmar, responda: "[SEND_FILE: ID] Enviando o material...".\n`;
            systemPrompt += `8. VÍDEOS VINCULADOS [TEM_VIDEO]: Se o item tem esse marcador, NÃO envie o vídeo imediatamente. Pergunte: "Gostaria de ver um vídeo do produto?". Se o cliente confirmar, responda: "[SEND_VIDEO: ID] Aqui está o vídeo!".`;
        }

        // ============================================================
        // SISTEMA DE COMUNICAÇÃO NATURAL — REGRA GLOBAL IMUTÁVEL
        // Aplica-se a TODOS os agentes, independente da função principal.
        // Não pode ser alterada ou vista pelos clientes.
        // ============================================================
        systemPrompt += `\n\n════════════════════════════════════════════════
PROTOCOLO DE COMUNICAÇÃO NATURAL (OBRIGATÓRIO — GLOBAL)
════════════════════════════════════════════════

Sua prioridade máxima é soar como um humano real em uma conversa —
nunca como um sistema automatizado ou chatbot.

❌ PROIBIÇÕES ABSOLUTAS (jamais faça isso):
- Nunca use listas numeradas (1. 2. 3.) em respostas conversacionais
- Nunca use bullet points (•, -, *) para apresentar opções ao usuário
- Nunca comece respostas com "Claro!", "Certamente!", "Com prazer!", "Olá!", "Oi tudo bem?"
- Nunca repita o que o usuário disse antes de responder
- Nunca use frases de chatbot como "Como posso te ajudar hoje?"
- Nunca dê 3 opções em lista — pergunte de forma fluida dentro da frase
- Nunca use headers (##, **Título:**) em respostas conversacionais
- Nunca termine com "Há mais alguma coisa que posso fazer por você?" ou "Se precisar estou aqui!"
- Nunca confirme micro-ações: em vez de "Certo! Vou processar...", simplesmente faça e informe o resultado

✅ COMO SE COMUNICAR CORRETAMENTE:

1. OPÇÕES DENTRO DA FRASE
   ❌ Errado: "Você prefere:\n1. Opção A\n2. Opção B"
   ✅ Certo: "Você prefere começar pela parte técnica, pelo design, ou quer mapear o escopo primeiro?"

2. LINGUAGEM DIRETA E COLOQUIAL
   ❌ Errado: "Entendido. Procederei com a solicitação."
   ✅ Certo: "Tá, deixa eu verificar isso pra você."

3. UMA PERGUNTA DE CADA VEZ
   Nunca faça múltiplas perguntas seguidas. Escolha a mais importante e
   espere a resposta antes de perguntar outra coisa.

4. CONTRAÇÕES E EXPRESSÕES NATURAIS
   - "tá" em vez de "está" (em contexto informal)
   - "pra" em vez de "para" (quando o cliente usa linguagem casual)
   - "a gente" em vez de "nós"
   - Espelhe o registro do cliente: se ele é formal, seja formal; se é casual, relaxe o tom

5. DEMONSTRE QUE PROCESSOU O CONTEXTO
   Em vez de só responder, mostre que entendeu:
   ✅ "Então você quer acelerar isso antes do prazo de sexta — faz sentido.
      A forma mais rápida seria..."

6. SEJA DIRETO, NÃO PROLIXO
   Respostas curtas quando a pergunta é simples. Não explique o óbvio.
   Se alguém pergunta "qual o horário?", responda o horário — sem preâmbulos.

7. PAUSAS CONVERSACIONAIS (quando pertinente)
   "Deixa eu pensar..." / "Boa pergunta, isso depende de..."
   Isso quebra a sensação de resposta automática.

8. ADMITA INCERTEZA NATURALMENTE
   ❌ Errado: "Não possuo essa informação."
   ✅ Certo: "Não tenho certeza disso, mas posso verificar / o que eu sei é..."

9. REAJA EMOCIONALMENTE QUANDO PERTINENTE
   Positivo: "Que ótimo, isso vai facilitar bastante!"
   Negativo: "Entendo, isso realmente complica as coisas."

10. ESTRUTURA IDEAL DE RESPOSTA
    [Reconhecimento breve do contexto, se necessário]
    [Resposta ou ação direta]
    [Uma pergunta ou próximo passo, se necessário — apenas um]

CALIBRAÇÃO DE TOM (leia as primeiras mensagens e ajuste):
- Mensagens curtas e diretas → seja igualmente conciso
- Mensagens detalhadas e formais → seja mais elaborado e profissional
- Emojis e linguagem descontraída → pode relaxar o tom
- Frustração ou urgência → seja direto, objetivo, sem rodeios

IMAGENS (REGRA DE OURO):
- "Foto", "Imagem", "Fotografia", "Ver", "Mostra" = TUDO A MESMA COISA.
- Se pedirem QUALQUER termo visual, e tiver [TEM_IMAGEM], VOCÊ DEVE MANDAR A TAG [SHOW_IMAGE: ID].
- JAMAIS diga "não consigo enviar imagens". Você CONSEGUE (via tag).
- Se não tiver foto da variação, mande a principal. NUNCA deixe o cliente sem foto.
- 🚨 MÚLTIPLAS IMAGENS: N produtos pedidos = N tags [SHOW_IMAGE: ID] na resposta. NUNCA omita nenhuma.
════════════════════════════════════════════════`;

        // Strict Anti-Repetition logic if history exists
        if (history && history.length > 0) {
            systemPrompt += `\n\nATENÇÃO: Este é um diálogo em andamento. NÃO CUMPRIMENTE o usuário novamente.
        CRÍTICO: Não ofereça ajuda extra no final da mensagem. Apenas responda.`;
        } else {
            // First message handling
            if (config.persona) {
                let personaData = {};
                try {
                    personaData = typeof config.persona === 'string' ? JSON.parse(config.persona) : config.persona;
                } catch (e) { }

                if (personaData && personaData.greetingMessage) {
                    systemPrompt += `\n\nATENÇÃO: Esta é a PRIMEIRA mensagem do usuário, MAS o sistema já enviou a seguinte frase de apresentação automaticamente: "${personaData.greetingMessage}"
        CRÍTICO: VOCÊ ESTÁ PROIBIDO DE CUMPRIMENTAR O USUÁRIO NESTA MENSAGEM (ex: não diga "Olá", "Oi", "Tudo bem", "Sou o assistente"). Vá direto ao ponto e responda à mensagem do usuário de forma natural continuando a conversa.`;
                }
            }
        }

        // Inject Audio Context if applicable
        if (isAudioInput) {
            systemPrompt += `\n\n[SISTEMA]: O usuário enviou uma MSG DE ÁUDIO que foi transcrita.
        - O texto inicia com "[ÁUDIO TRANSCRITO]:".
        - NÃO diga "não ouço áudio". Você JÁ LEU o que ele falou.
        - Responda naturalmente ao conteúdo.
        
        DIRETRIZ DE ÁUDIO (MUITO IMPORTANTE):
        1. Como você vai responder em ÁUDIO, **NÃO LEIA listas numeradas** ("um... dois..."). Fica robótico.
        2. Mantenha a resposta em texto estruturada (com listas e quebras), MAS...
        3. NO FINAL DA RESPOSTA, crie um bloco **[SCRIPT_AUDIO]:** com o texto exato que deve ser falado.
        4. No [SCRIPT_AUDIO]:
           - **CONVERSA FLUIDA**: Substitua listas por frases conectadas.
           - EXEMPLO TEXTO: "Temos: 1. Plano A, 2. Plano B."
           - EXEMPLO SCRIPT: "Nós temos o Plano A e também o Plano B, que é ótimo."
           - Fale de forma fluida, como um brasileiro.
           - Use palavras em inglês naturalmente.
           - NÃO use emojis ou markdown.`;
        }

        // Guidelines for continuity
        if (history && history.length > 0) {
            systemPrompt += `\n\nDIRETRIZES DE CONTINUIDADE (CRÍTICO - NÃO IGNORE):
        1. CONTEXTO IMPLÍCITO (OBRIGATÓRIO): Se o usuário fizer uma pergunta sem citar o nome do produto ou apenas confirmar algo (ex: "Sim", "Quero", "Manda", "Pode ser", "Quanto custa?"), você DEVE assumir que ele está falando do ÚLTIMO produto/serviço mencionado no histórico.
        
        2. PROTOCOLO DE RESPOSTA CURTA (REGRA SUPREMA):
           - Cenario: Você ofereceu um PDF ("Quer o PDF?") e o usuário disse SIM ("Sim", "Quero", "Pode mandar").
           - AÇÃO OBRIGATÓRIA: NÃO PERGUNTE "Qual PDF?". IDENTIFIQUE o serviço da mensagem anterior e envie o PDF dele IMEDIATAMENTE usando [SEND_PDF: ID].
           - EXEMPLO:
             IA: "...O serviço custa R$50. Quer o PDF?"
             User: "Sim"
             IA (CORRETO): "[SEND_PDF: serviço_xyz] Aqui está o arquivo!"
             IA (ERRADO): "Qual PDF você quer?" (ISSO É PROIBIDO)

        3. NÃO TROQUE O ASSUNTO: Se estávamos falando de "Camiseta", e o usuário pergunta "Tem G?", é PROIBIDO falar sobre "iPhone".
        4. ZERO ALUCINAÇÃO: Não invente recursos.
        5. REGRA DE OURO: Só pergunte "Qual produto?" se o histórico estiver VAZIO ou se o usuário mudar de assunto drasticamente. No fluxo de venda, ASSUMA O CONTEXTO ANTERIOR.`;
        }

        // Knowledge Base Injection
        if (config.knowledgeBase) {
            try {
                const kb = typeof config.knowledgeBase === 'string' ? JSON.parse(config.knowledgeBase) : config.knowledgeBase;

                // Inject Files
                if (kb.files && kb.files.length > 0) {
                    systemPrompt += "\n\n###### BASE DE CONHECIMENTO (ARQUIVOS) ######\n";

                    // 1. Create Index Summary (Crucial for AI planning)
                    systemPrompt += "VOCÊ POSSUI OS SEGUINTES ARQUIVOS EM SUA MEMÓRIA:\n";
                    kb.files.forEach((f, idx) => {
                        systemPrompt += `${idx + 1}. [${f.name}] - Função: ${f.description || 'Geral'} (Gatilho: ${f.usageTrigger || 'Sempre que relevante'})\n`;
                    });
                    systemPrompt += "\nINSTRUÇÃO DE USO: Se a pergunta do usuário ativar um GATILHO acima, LEIA O CONTEÚDO DO ARQUIVO correspondente abaixo antes de responder.\n";

                    // 2. Inject Content
                    systemPrompt += "\n--- CONTEÚDO DETALHADO DOS ARQUIVOS ---\n";
                    kb.files.forEach(f => {
                        if (f.content) {
                            systemPrompt += `\n[INÍCIO DO ARQUIVO: ${f.name}]\n`;
                            if (f.description) systemPrompt += `> CONTEXTO: ${f.description}\n`;
                            if (f.usageTrigger) systemPrompt += `> GATILHO: ${f.usageTrigger}\n`;
                            systemPrompt += `> CONTEÚDO:\n${f.content}\n[FIM DO ARQUIVO: ${f.name}]\n`;
                        }
                    });
                    systemPrompt += "--------------------------------------\n";
                }

                // Inject Links
                if (kb.links && kb.links.length > 0) {
                    systemPrompt += "\n=== CONTEÚDO EXTRAÍDO DE LINKS ===\n";
                    kb.links.forEach(l => {
                        if (l.content) {
                            systemPrompt += `\n[FONTE: ${l.url}]\n${l.content}\n[FIM DA FONTE]\n`;
                        }
                    });
                }

                // Inject Q&A
                if (kb.qa && kb.qa.length > 0) {
                    systemPrompt += "\n=== PERGUNTAS E RESPOSTAS FREQUENTES (Q&A) ===\n";
                    kb.qa.forEach(item => {
                        if (item.question && item.answer) {
                            systemPrompt += `\nQ: ${item.question}\nA: ${item.answer}\n`;
                        }
                    });
                }

                systemPrompt += "\n\nINSTRUÇÃO FINAL DE CONHECIMENTO: Verifique PRIMEIRO a lista de arquivos e Q&A. Se não encontrar a resposta, diga honestamente que não tem essa informação nos manuais disponíveis.";

            } catch (e) {
                console.error('Error parsing Knowledge Base:', e);
            }
        }

        // --- DEBUG LOGS FOR CONTEXT ---
        console.log('--- SYSTEM PROMPT DIAGNOSTICS ---');

        // Check Products
        if (config.products) {
            let prods = typeof config.products === 'string' ? JSON.parse(config.products) : config.products;
            console.log(`[Context] Total Products: ${prods.length}`);
            console.log(`[Context] Product Names: ${prods.map(p => p.name).join(', ')}`);
        } else {
            console.log('[Context] No Producs found.');
        }

        // Check Knowledge Base
        if (config.knowledgeBase) {
            let kb = typeof config.knowledgeBase === 'string' ? JSON.parse(config.knowledgeBase) : config.knowledgeBase;
            if (kb.files) {
                console.log(`[Context] Total Files: ${kb.files.length}`);
                kb.files.forEach(f => {
                    console.log(` - File: ${f.name} (Content Length: ${f.content ? f.content.length : 0} chars)`);
                });
            }
        }
        console.log('---------------------------------');

        console.log('[Chat] System Prompt Context:', systemPrompt); // DEBUG

        // --- PROMPT REWRITING (Invisible Hand Strategy) ---
        // Problem: AI hallucinates when user says just "Sim" because it loses context.
        // Solution: Rewrite "Sim" to "Sim, envie o PDF do [Item Anterior]" before sending to AI.

        let finalUserMessage = message;

        if (history && history.length > 0) {
            // Find last assistant message
            const lastAiMsg = [...history].reverse().find(m => m.role === 'assistant');

            if (lastAiMsg) {
                const aiContent = (lastAiMsg.content || '').toLowerCase();
                const userContent = (message || '').toLowerCase();

                // Check if AI offered PDF recently (keywords: pdf OR generic file terms AND question words)
                const fileKeywords = ['pdf', 'arquivo', 'material', 'lâmina', 'apresentação', 'catalogo', 'catálogo'];
                const questionKeywords = ['?', 'gostaria', 'quer', 'deseja', 'posso', 'enviar'];

                const hasFileKeyword = fileKeywords.some(kw => aiContent.includes(kw));
                const hasQuestionKeyword = questionKeywords.some(kw => aiContent.includes(kw));

                if (hasFileKeyword && hasQuestionKeyword) {

                    // Check if User accepted
                    const acceptanceKeywords = ['sim', 'quero', 'pode', 'manda', 'gostaria', 'yes', 'ok', 'envia', 'isso'];
                    const isAcceptance = acceptanceKeywords.some(kw => userContent.includes(kw));

                    if (isAcceptance) {
                        console.log('[Context] Detected Acceptance of File Offer.');

                        // Extract topic from AI message (simple heuristic: grab first 80 chars for context)
                        const topicSnippet = lastAiMsg.content.substring(0, 100).replace(/\n/g, ' ');

                        // REWRITE PROMPT
                        finalUserMessage = `(Mensagem do Sistema: O usuário respondeu "${message}" confirmando o interesse no arquivo oferecido anteriormente.)
                    
                    CONTEXTO DA OFERTA ANTERIOR: "${topicSnippet}..."
                    
                    AÇÃO OBRIGATÓRIA:
                    1. Não faça mais perguntas.
                    2. Envie IMEDIATAMENTE o PDF ou Arquivo relacionado a essa oferta.
                    3. Use a tag [SEND_PDF: ID] ou [SEND_IMAGE: ID] correta.`;

                        console.log('[Context] REWROTE USER PROMPT:', finalUserMessage);
                    }
                }
            }
        }
        // --- END PROMPT REWRITING ---

        // --- SYSTEM PROMPT INJECTION (CRITICAL FIX FOR IMAGES) ---
        const imageEnforcementFooter = `
*** ATENÇÃO: PROTOCOLO DE ENVIO DE IMAGEM ***
SE O USUÁRIO PEDIU UMA FOTO E O PRODUTO TEM IMAGEM (campo [TEM_IMAGEM]):
1. É PROIBIDO DIZER QUE VAI ENVIAR A IMAGEM SEM COLOCAR A TAG DE COMANDO.
2. A TAG OBRIGATÓRIA É: [SHOW_IMAGE: <NUMERO_DO_ID>]
3. SUBSTITUA <NUMERO_DO_ID> PELO NÚMERO REAL QUE APARECE DEPOIS DE "ID:" NA LISTA DE PRODUTOS.

EXEMPLO DE RACIOCÍNIO CORRETO:
- Na lista acima, vejo: "ID: 1770087032682 | Nome: Camisa Engenheiro | [TEM_IMAGEM]"
- O usuário pediu "foto da camisa engenheiro"
- Vou usar o ID EXATO da lista: 1770087032682

RESPOSTA CORRETA (1 produto):
"Aqui está a foto da Camisa Engenheiro! 👕
[SHOW_IMAGE: 1770087032682]"

🚨 REGRA PARA MÚLTIPLOS PRODUTOS (CRÍTICO):
Quando o cliente pedir fotos de VÁRIOS produtos ao mesmo tempo:
- Você DEVE incluir uma tag [SHOW_IMAGE: ID] para CADA produto individualmente.
- NUNCA envie só a primeira imagem e esqueça as demais.
- Cada produto com imagem deve ter SUA PRÓPRIA tag [SHOW_IMAGE: ID] na resposta.

EXEMPLO CORRETO (múltiplos produtos):
"Aqui estão as fotos que você pediu! 📸

Renda Jasmine 18cm:
[SHOW_IMAGE: ID_DO_JASMINE]

Renda Mercúrio 18cm:
[SHOW_IMAGE: ID_DO_MERCURIO]

Renda Marte 18cm:
[SHOW_IMAGE: ID_DO_MARTE]"

❌ ERROS FATAIS - NUNCA FAÇA:
- [SHOW_IMAGE: ID_DO_PRODUTO] ← Não use texto, use número!
- [SHOW_IMAGE: 50] ← Não invente IDs!
- [SHOW_IMAGE: 12345] ← Não use IDs de exemplo!
- Mencionar apenas 1 imagem quando o cliente pediu várias ← PROIBIDO!

✅ REGRA DE OURO: 
COPIE O ID NUMÉRICO EXATO DA LISTA DE PRODUTOS. Se o ID na lista é "1770087032682", use exatamente "1770087032682".
Para N produtos = N tags [SHOW_IMAGE: ID] na resposta. Sem exceção.
`;
        // --- AUTOTAGGING RULES INJECTION ---
        if (tagTriggers && tagTriggers.length > 0) {
            systemPrompt += `\n\n🔴 REGRAS DE ETIQUETAGEM AUTOMÁTICA (TAGTRIGGERS):\nVocê pode aplicar etiquetas ao ticket atual invocando a function \`apply_tag(tagId)\`.\nAvalie a conversa e, se alguma das condições abaixo for atendida, CHAME a function com o ID numérico correspondente:\n`;
            tagTriggers.forEach(t => {
                systemPrompt += `- Se o cliente falar sobre: "${t.triggerCondition}" -> APLIQUE A TAG ID: ${t.tagId} (${t.tagName})\n`;
            });
            systemPrompt += `OBS: Aplique a tag silenciosamente invocando a function correta. Não avise o usuário sobre a etiqueta.\n`;
        }

        // Append to system prompt just for this execution
        const finalSystemPrompt = systemPrompt + "\n\n" + imageEnforcementFooter;

        // Prepare Messages (History + System)
        let messages = [{ role: "system", content: finalSystemPrompt }];

        if (Array.isArray(history) && history.length > 0) {
            const cleanHistory = history.map(h => ({
                role: h.role === 'user' || h.role === 'assistant' || h.role === 'tool' ? h.role : 'user',
                content: h.content || '',
                tool_calls: h.tool_calls,
                tool_call_id: h.tool_call_id
            }));
            messages = [...messages, ...cleanHistory];
        }

        // Add current user message (Rewritten or Original)
        messages.push({ role: "user", content: finalUserMessage });

        // --- TOOL DEFINITIONS ---
        const tools = [
            {
                type: "function",
                function: {
                    name: "check_availability",
                    description: "Verifica horários disponíveis para agendamento.",
                    parameters: {
                        type: "object",
                        properties: {
                            date: { type: "string", description: "Data desejada (YYYY-MM-DD)" },
                            specialistId: { type: "string" },
                            typeId: { type: "string" }
                        },
                        required: ["date"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "book_appointment",
                    description: "Realiza o agendamento.",
                    parameters: {
                        type: "object",
                        properties: {
                            startTime: { type: "string", description: "Horário de início (ISO 8601)" },
                            customerName: { type: "string" },
                            customerPhone: { type: "string" },
                            specialistId: { type: "string" },
                            typeId: { type: "string" },
                            notes: { type: "string" }
                        },
                        required: ["startTime", "customerName", "customerPhone"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "list_available_products",
                    description: "Lista todos os produtos/serviços disponíveis AGORA. Use SEMPRE que o usuário perguntar sobre produtos disponíveis. NUNCA liste produtos de memória.",
                    parameters: {
                        type: "object",
                        properties: {
                            type: {
                                type: "string",
                                enum: ["produto", "servico", "todos"],
                                description: "Filtrar por tipo (padrão: todos)"
                            }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "apply_tag",
                    description: "Aplica uma etiqueta (tag) de classificação no atendimento atual baseado nas regras. Deve ser chamado com o ID numérico correto.",
                    parameters: {
                        type: "object",
                        properties: {
                            tagId: { type: "number", description: "O ID numérico da tag a ser aplicada" }
                        },
                        required: ["tagId"]
                    }
                }
            }
        ];

        // --- TOOL LOOP (Max 3 Turns) ---
        let aiResponse = "";
        let turns = 0;
        const maxTurns = 3;
        let calledCatalog = false; // Set true when list_available_products is called
        // Check if Google Config exists and has token
        const hasCalendar = config.googleConfig && config.googleConfig.accessToken;
        // ALWAYS enable tools (we need list_available_products to work)
        const shouldUseTools = true;

        // Create OpenAI Client dynamically with the correct key
        let openaiApiKey = process.env.OPENAI_API_KEY;
        if (config.integrations && config.integrations.openaiKey) {
            openaiApiKey = config.integrations.openaiKey;
        }

        if (!openaiApiKey) {
            console.error('[AI] No OpenAI Key found in Config or Env!');
            return { aiResponse: "Erro: Chave de API não configurada." };
        }

        const client = new OpenAI({ apiKey: openaiApiKey });

        if (!shouldUseTools) {
            console.log('[AI] Running in TEXT-ONLY mode (Calendar not connected or token missing).');
        } else {
            console.log('[AI] Running in TOOL-ENABLED mode (Calendar connected).');
        }

        while (turns < maxTurns) {
            console.log('[AI Debug] Turn', turns + 1, '- Sending request to OpenAI');
            console.log('[AI Debug] Model:', config.model || "gpt-4o-mini");
            console.log('[AI Debug] Tools enabled:', shouldUseTools);
            console.log('[AI Debug] Number of tools:', tools.length);
            console.log('[AI Debug] Message count:', messages.length);
            console.log('[AI Debug] Last user message:', messages[messages.length - 1].content.substring(0, 100));

            const completion = await client.chat.completions.create({
                messages: messages,
                model: config.model || "gpt-4o-mini", // Use config model or default
                tools: shouldUseTools ? tools : undefined,
                tool_choice: shouldUseTools ? "auto" : undefined
            });

            console.log('[AI Debug] Response received');
            console.log('[AI Debug] Finish reason:', completion.choices[0].finish_reason);
            console.log('[AI Debug] Has tool calls:', !!completion.choices[0].message.tool_calls);
            if (completion.choices[0].message.tool_calls) {
                console.log('[AI Debug] Tool calls:', completion.choices[0].message.tool_calls.map(tc => tc.function.name));
            }

            const msg = completion.choices[0].message;
            aiResponse = msg.content || "";

            // Check for Tool Calls
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                messages.push(msg); // Add AI's intent to history

                for (const toolCall of msg.tool_calls) {
                    const fnName = toolCall.function.name;
                    const args = JSON.parse(toolCall.function.arguments);
                    let toolResult = "";
                    console.log(`[AI Tool] Executing ${fnName}`, args);

                    try {
                        if (fnName === 'check_availability') {
                            if (!hasCalendar) {
                                toolResult = JSON.stringify({ status: 'error', message: 'Agendamento não configurado' });
                            } else {
                                const calConfig = await prisma.googleCalendarConfig.findUnique({ where: { companyId: config.companyId } });
                                const date = args.date;
                                const timeZone = calConfig?.timezone || 'America/Sao_Paulo';
                                const startIso = `${date}T00:00:00Z`;
                                const endIso = `${date}T23:59:59Z`;
                                const busy = await checkAvailability(config.companyId, startIso, endIso, timeZone);
                                toolResult = JSON.stringify({ status: 'success', busySlots: busy, officeHours: calConfig?.officeHours });
                            }
                        }
                        else if (fnName === 'apply_tag') {
                            if (!ticketId) {
                                toolResult = JSON.stringify({ status: 'error', message: 'Ticket ID not available in this context' });
                                console.warn('[AI Tool] apply_tag called but no ticketId provided.');
                            } else {
                                const success = await applyPrompTag(config, ticketId, args.tagId);
                                toolResult = JSON.stringify({ status: success ? 'success' : 'error', message: success ? `Tag ${args.tagId} aplicada.` : 'Falha na API' });
                            }
                        }
                        else if (fnName === 'book_appointment') {
                            if (!hasCalendar) {
                                toolResult = JSON.stringify({ status: 'error', message: 'Agendamento não configurado' });
                            } else {
                                const eventDetails = {
                                    summary: `Agendamento - ${args.customerName}`,
                                    description: `Tel: ${args.customerPhone}\nNotas: ${args.notes}`,
                                    startTime: args.startTime,
                                    endTime: new Date(new Date(args.startTime).getTime() + 30 * 60000).toISOString()
                                };
                                if (args.typeId && config.appointmentTypes) {
                                    const t = config.appointmentTypes.find(x => x.id === args.typeId);
                                    if (t) {
                                        eventDetails.summary = `${t.name} - ${args.customerName}`;
                                        eventDetails.endTime = new Date(new Date(args.startTime).getTime() + t.duration * 60000).toISOString();
                                    }
                                }
                                const gEvent = await createCalendarEvent(config.companyId, eventDetails);
                                await prisma.appointment.create({
                                    data: {
                                        companyId: config.companyId,
                                        googleEventId: gEvent.id,
                                        customerName: args.customerName,
                                        customerPhone: args.customerPhone,
                                        startTime: new Date(eventDetails.startTime),
                                        endTime: new Date(eventDetails.endTime),
                                        notes: args.notes,
                                        specialistId: args.specialistId,
                                        typeId: args.typeId,
                                        status: 'CONFIRMED'
                                    }
                                });
                                toolResult = JSON.stringify({ status: 'success', message: 'Agendamento confirmado!', link: gEvent.htmlLink });
                            }
                        }
                        else if (fnName === 'list_available_products') {
                            calledCatalog = true;
                            console.log('[Function: list_available_products] CALLED with args:', JSON.stringify(args));
                            const requestedType = args.type || 'todos';
                            console.log('[Function: list_available_products] Requested type:', requestedType);

                            // 🔥 DEFENSIVE FIX: Parse products if it's a string (backwards compatibility)
                            let rawProducts = config.products || [];
                            if (typeof rawProducts === 'string') {
                                console.warn('[Function: list_available_products] ⚠️ Products came as STRING! Parsing...');
                                try {
                                    rawProducts = JSON.parse(rawProducts);
                                } catch (e) {
                                    console.error('[Function: list_available_products] ❌ Failed to parse products string:', e);
                                    rawProducts = [];
                                }
                            }

                            const allProducts = Array.isArray(rawProducts) ? rawProducts : [];
                            console.log('[Function: list_available_products] Total products in config:', allProducts.length);

                            // 🔥 CRITICAL FIX: Filter by companyId (multi-tenant isolation)
                            // Products from ALL companies are stored in the same JSON field.
                            // We MUST filter to show only THIS company's products!
                            const companyProducts = allProducts.filter(p => {
                                // If product has companyId, it MUST match
                                if (p.companyId) {
                                    return p.companyId === config.companyId;
                                }
                                // Legacy products without companyId: assume they belong to this company
                                // (This handles old data before multi-tenant fix)
                                return true;
                            });

                            console.log(`[Function: list_available_products] Filtered by companyId (${config.companyId}): ${companyProducts.length} products`);
                            console.log('[Function: list_available_products] Company products:', companyProducts.map(p => p.name).join(', '));

                            // 🚨 SAFETY CHECK: Warn if suspiciously high number
                            if (companyProducts.length > 1000) {
                                console.warn('[Function: list_available_products] ⚠️ WARNING: More than 1000 products for single company!');
                                console.warn('[Function: list_available_products] This may indicate a filtering issue.');
                            }

                            const activeProducts = companyProducts.filter(p => p.active !== false);
                            console.log('[Function: list_available_products] Active products:', activeProducts.length);

                            let filtered = activeProducts;
                            if (requestedType === 'produto') {
                                filtered = activeProducts.filter(p => p.type !== 'service');
                            } else if (requestedType === 'servico') {
                                filtered = activeProducts.filter(p => p.type === 'service');
                            }
                            console.log('[Function: list_available_products] Filtered by type:', filtered.length);

                            const result = filtered.map(p => {
                                // TRUNCATE EXTREMELY LARGE DATA (LIKE BASE64 IMAGES) TO NOT EXCEED TOKEN LIMITS!
                                const globalHidePrices = config.catalogConfig?.hidePrices || false;
                                const hideReason = config.catalogConfig?.hidePricesReason || 'Sob consulta';
                                const safeVariants = (p.variantItems || []).map(v => ({
                                    id: String(v.id), // Stringify numbers to be safe
                                    name: v.name,
                                    color: v.color,
                                    size: v.size,
                                    price: globalHidePrices ? null : Number(v.price),
                                    priceDisplay: globalHidePrices ? `[PREÇO_OCULTO: ${hideReason}]` : `R$ ${Number(v.price || p.price)}`,
                                    stock: (v.stock !== undefined && v.stock !== null) ? Number(v.stock) : 0,
                                    stockDisplay: (v.stock !== undefined && v.stock !== null)
                                        ? (Number(v.stock) > 0 ? `${Number(v.stock)} em estoque` : 'SEM ESTOQUE')
                                        : 'Estoque não informado',
                                    hasImage: !!v.image // Tell AI it has an image, but do NOT send the base64 string
                                }));

                                // For simple products with no variants, use the top-level stock field
                                const productStock = (p.stock !== undefined && p.stock !== null) ? Number(p.stock) : 0;
                                const productStockDisplay = (p.stock !== undefined && p.stock !== null)
                                    ? (Number(p.stock) > 0 ? `${Number(p.stock)} em estoque` : 'SEM ESTOQUE')
                                    : 'Estoque não informado';

                                return {
                                    id: String(p.id),
                                    name: p.name,
                                    type: p.type === 'service' ? 'servico' : 'produto',
                                    description: String(p.description || '').substring(0, 500),
                                    price: globalHidePrices ? null : Number(p.price),
                                    priceDisplay: globalHidePrices ? `[PREÇO_OCULTO: ${hideReason}]` : `R$ ${Number(p.price)}`,
                                    priceHidden: globalHidePrices,
                                    stock: safeVariants.length > 0 ? null : productStock,
                                    stockDisplay: safeVariants.length > 0 ? 'Ver variações abaixo' : productStockDisplay,
                                    unit: p.unit || 'Unidade',
                                    customUnit: p.customUnit || '',
                                    paymentConditions: globalHidePrices ? `[PREÇO_OCULTO: ${hideReason}]` : (p.paymentConditions || ''),
                                    paymentLink: p.paymentLink || '',
                                    hasPaymentLink: !!p.hasPaymentLink,
                                    paymentPrices: globalHidePrices ? [] : (p.paymentPrices || []), // Returns list of {label, price, active}
                                    variantItems: safeVariants,
                                    visual_instruction: p.image
                                        ? `⚠️ PARA MOSTRAR FOTO DESTE PRODUTO, USE EXATAMENTE: [SHOW_IMAGE: ${p.id}]`
                                        : 'Sem foto disponível',
                                    hasImage: !!p.image,
                                    hasVariations: safeVariants.length > 0
                                };
                            });

                            console.log(`[Function: list_available_products] Returning ${result.length} products (type: ${requestedType})`);
                            // DO NOT console.log the full result if it might be huge, but without images it should be safe now
                            console.log('[Function: list_available_products] Result preview:', JSON.stringify(result).substring(0, 200) + '...');

                            toolResult = JSON.stringify({
                                status: 'success',
                                total: result.length,
                                products: result
                            });
                            console.log('[Function: list_available_products] toolResult length:', toolResult.length);
                        }
                    } catch (e) {
                        toolResult = JSON.stringify({ status: 'error', message: e.message });
                    }

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: toolResult
                    });
                }
                turns++;
            } else {
                break;
            }
        }

        // --- CLEANUP: WhatsApp Formatting (Markdown ** to *) ---
        aiResponse = aiResponse.replace(/\*\*/g, '*');

        // --- Audio Script Extraction ---
        let textForAudio = aiResponse;
        const scriptRegex = /\[SCRIPT_AUDIO\]:([\s\S]*?)$/i;

        const scriptMatch = aiResponse.match(scriptRegex);
        if (scriptMatch && scriptMatch[1]) {
            textForAudio = scriptMatch[1].trim();
            aiResponse = aiResponse.replace(scriptRegex, '').trim();
            console.log('[Chat] Separate Audio Script detected and extracted.');
        }

        // --- Image Detection Logic ---
        let productImageUrl = null;
        let productCaption = ""; // Initialize caption

        logFlow(`AI Response Raw: ${aiResponse.substring(0, 100)}...`);

        // Robust Regex: Optional quotes (straight or smart), spaces, dots/dashes
        // (Legacy Logic Part 1 Removed)

        // (Legacy Logic Fully Removed)
        // Append debug error if any
        // --- 2. MULTI-IMAGE & TEXT SPLITTING LOGIC ---
        // (Variables already declared above)
        productImageUrl = null; // Reset for legacy
        productCaption = "";
        let messageChunks = []; // Ensure messageChunks is declared or use existing if any (it's new)


        // check if we have image tags
        const globalImageRegex = /\[SHOW_IMAGE:\s*['"“”]?([^\]]+?)['"“”]?\s*\]/gi;
        let match;
        let lastIndex = 0;

        // We need to execute regex in a loop to find all occurrences
        // and split the text accordingly.

        // First, check if ANY tag exists to avoid overhead
        if (globalImageRegex.test(aiResponse)) {
            console.log(`[Multi - Image] DETECTED IMAGE TAGS IN RESPONSE!`);
            globalImageRegex.lastIndex = 0; // Reset

            while ((match = globalImageRegex.exec(aiResponse)) !== null) {
                // Text BEFORE the tag
                const textSegment = aiResponse.substring(lastIndex, match.index).trim();
                if (textSegment) {
                    messageChunks.push({ type: 'text', content: textSegment });
                }

                // The Image Tag ID
                const targetId = match[1];
                const resolved = resolveProductImageFromConfig(targetId, config);

                if (resolved.found) {
                    console.log(`[Chat] Found Image for ${targetId}`);
                    messageChunks.push({
                        type: 'image',
                        url: resolved.url,
                        caption: resolved.caption,
                        id: targetId
                    });

                    // Set legacy for first image found (backward compat)
                    if (!productImageUrl) {
                        productImageUrl = resolved.url;
                        productCaption = resolved.caption;
                    }
                } else {
                    // Imagem não encontrada — logar apenas no servidor, NÃO enviar mensagem de erro ao cliente
                    console.log(`[Chat] Image not found for ${targetId} — skipping silently (no error message sent to client)`);
                    // NÃO adicionar chunk de erro. O produto simplesmente não terá imagem enviada.
                }

                lastIndex = globalImageRegex.lastIndex;
            }

            // Text AFTER the last tag
            const remainingText = aiResponse.substring(lastIndex).trim();
            if (remainingText) {
                messageChunks.push({ type: 'text', content: remainingText });
            }


            // CLEANUP: Remove tags from the main aiResponse used for history/audio?
            // Actually, for audio, we probably want the text but NOT the tags.
            // Let's strip tags from aiResponse for the return value
            aiResponse = aiResponse.replace(globalImageRegex, '').trim();


        } else {
            // --- AUTO-SPLIT LOGIC ---
            // Priority 1: [BREAK] marker (explicit from AI)
            // Priority 2: Automatic paragraph split on \n\n when response is long
            // Each chunk gets a "typing" presence before being sent (handled by the send loop)

            const CHAR_THRESHOLD = 160; // Split only if total response is longer than this

            // Helper: strip [BREAK] and split, or split on \n\n
            const splitIntoChunks = (text) => {
                // Remove any leftover [BREAK] markers first
                const cleaned = text.replace(/\[BREAK\]/gi, '\n\n').trim();

                // Split on double newlines (paragraph breaks)
                const rawParts = cleaned.split(/\n\n+/)
                    .map(p => p.trim())
                    .filter(p => p.length > 0);

                if (rawParts.length <= 1) return [cleaned];

                // Merge very short paragraphs (< 60 chars) with the next one
                // to avoid micro-messages like "Sim." or "Claro!"
                const merged = [];
                let buffer = '';
                for (const part of rawParts) {
                    if (buffer && (buffer.length + part.length) < 120) {
                        buffer += ' ' + part;
                    } else {
                        if (buffer) merged.push(buffer);
                        buffer = part;
                    }
                }
                if (buffer) merged.push(buffer);

                // Cap at 3 chunks max to avoid flooding the client
                if (merged.length > 3) {
                    const capped = merged.slice(0, 2);
                    capped.push(merged.slice(2).join(' '));
                    return capped;
                }

                return merged;
            };

            const hasBreakMarker = /\[BREAK\]/i.test(aiResponse);
            const isLongResponse = aiResponse.length > CHAR_THRESHOLD;

            if (hasBreakMarker || isLongResponse) {
                const parts = splitIntoChunks(aiResponse);
                if (parts.length > 1) {
                    console.log(`[Split] Auto-split into ${parts.length} chunks (trigger: ${hasBreakMarker ? '[BREAK]' : 'length=' + aiResponse.length}).`);
                    parts.forEach(part => messageChunks.push({ type: 'text', content: part }));
                } else {
                    messageChunks.push({ type: 'text', content: aiResponse });
                }
            } else {
                messageChunks.push({ type: 'text', content: aiResponse });
            }
        }

        // --- INJECT PRESENTATION PHRASE FOR NEW CHATS ---
        const hasUserMessage = history && Array.isArray(history) && history.some(m => m.role === 'user');
        
        if (!hasUserMessage && config.persona) {
            let personaData = {};
            try {
                personaData = typeof config.persona === 'string' ? JSON.parse(config.persona) : config.persona;
            } catch (e) { }

            if (personaData && personaData.greetingMessage) {
                console.log('[Chat] Injetando Frase de apresentação como primeira mensagem.');
                // Prepend the greeting message as the first chunk
                messageChunks.unshift({ type: 'text', content: personaData.greetingMessage });
                
                // Also prepend to aiResponse for APIs that only use aiResponse (like TestAI)
                if (aiResponse) {
                    aiResponse = personaData.greetingMessage + '\n\n' + aiResponse;
                } else {
                    aiResponse = personaData.greetingMessage;
                }
            }
        }

        // --- PDF Logic (Service Details) ---
        let pdfBase64 = null;
        let pdfName = null;
        const pdfTagRegex = /\[SEND_PDF:\s*['"]?([^\]]+?)['"]?\s*\]/i;
        const pdfMatch = aiResponse.match(pdfTagRegex);

        if (pdfMatch) {
            const targetId = pdfMatch[1];
            let foundPdf = null;
            let foundName = null;

            // Check Products/Services
            if (config.products) {
                let products = typeof config.products === 'string' ? JSON.parse(config.products) : config.products;
                const p = products.find(p => String(p.id) === String(targetId)); // loose equality for string/number id mix
                if (p && p.pdf) {
                    foundPdf = p.pdf;
                    foundName = `${p.name}.pdf`; // Fallback name
                }
            }

            if (foundPdf) {
                try {
                    pdfBase64 = foundPdf.replace(/^data:application\/pdf;base64,/, '');
                    pdfName = foundName;
                    console.log(`[Chat] Found PDF for ID ${targetId}.`);
                    // Remove tag
                    aiResponse = aiResponse.replace(new RegExp(`\\[SEND_PDF: \\s * ['"]?${targetId}['"]?\\s*\\]`, 'gi'), '').trim();
                } catch (e) {
                    console.error(`[Chat] PDF Processing Error:`, e);
                }
            } else {
                console.log(`[Chat] PDF requested for ID ${targetId} but not found.`);
                aiResponse = aiResponse.replace(new RegExp(`\\[SEND_PDF:\\s*['"]?${targetId}['"]?\\s*\\]`, 'gi'), `(❌ PDF não encontrado: ${targetId})`);
            }
        }

        // --- Attached File & Video Command Parsing ---
        const fileTagRegex = /\[SEND_FILE:\s*['"]?([^\]]+?)['"]?\s*\]/i;
        const videoTagRegex = /\[SEND_VIDEO:\s*['"]?([^\]]+?)['"]?\s*\]/i;

        const fileMatch = aiResponse.match(fileTagRegex);
        const videoMatch = aiResponse.match(videoTagRegex);

        if (fileMatch) {
            const targetId = fileMatch[1];
            let foundUrl = null;
            if (config.products) {
                let products = typeof config.products === 'string' ? JSON.parse(config.products) : config.products;
                const p = products.find(p => String(p.id) === String(targetId));
                if (p && p.attachedFile) foundUrl = p.attachedFile;
            }
            if (foundUrl) {
                aiResponse = aiResponse.replace(fileTagRegex, `\n\n🔗 *Material de Apoio:* ${foundUrl}`).trim();
            } else {
                aiResponse = aiResponse.replace(fileTagRegex, `(❌ Arquivo não encontrado: ${targetId})`);
            }
        }

        if (videoMatch) {
            const targetId = videoMatch[1];
            let foundUrl = null;
            if (config.products) {
                let products = typeof config.products === 'string' ? JSON.parse(config.products) : config.products;
                const p = products.find(p => String(p.id) === String(targetId));
                if (p && p.attachedVideo) foundUrl = p.attachedVideo;
            }
            if (foundUrl) {
                aiResponse = aiResponse.replace(videoTagRegex, `\n\n🎥 *Vídeo do Produto:* ${foundUrl}`).trim();
            } else {
                aiResponse = aiResponse.replace(videoTagRegex, `(❌ Vídeo não encontrado: ${targetId})`);
            }
        }

        // --- Audio Generation Logic ---
        let audioBase64 = null;
        let integrator = {};
        if (config.integrations) {
            try {
                integrator = typeof config.integrations === 'string'
                    ? JSON.parse(config.integrations)
                    : config.integrations;
            } catch (e) {
                console.error('[ProcessChat] Error parsing integrations JSON:', e);
            }
        }

        // 1. Master Switch (Checkbox: "Habilitar Respostas em Áudio")
        // If disabled in config, we NEVER generate, even if user sent audio.
        // (User said: "Configuration needs to apply to the received audio format")
        const isVoiceEnabled = integrator.enabled === true || integrator.enabled === 'true';

        // Check for API Key
        let apiKey = integrator.elevenLabsKey;

        // SAFETY CHECK: If Agent Key looks like OpenAI Key (sk-...), ignore it to prevent error
        if (apiKey && (apiKey.trim().startsWith('sk-') || apiKey.trim().startsWith('sk_'))) {
            console.warn(`[Audio] Detected OpenAI Key in ElevenLabs field (${apiKey.substring(0, 5)}...). Ignoring Agent Key.`);
            apiKey = null;
        }

        // Fallback to Global
        apiKey = apiKey || globalConfig?.elevenLabsKey;

        if (isVoiceEnabled && apiKey) {
            let shouldGenerate = false;

            // 2. Logic based on Input Type vs Config Trigger
            if (isAudioInput) {
                // Case A: User sent AUDIO
                // We always reply in Audio if feature is enabled.
                // (Even if set to 'percentage', Audio-for-Audio is the baseline expectation)
                shouldGenerate = true;
                console.log('[Audio] Audio Input detected -> Forcing Audio Response.');
            } else {
                // Case B: User sent TEXT
                if (integrator.responseType === 'audio_only') {
                    // UI: "Responder em áudio apenas quando o cliente enviar áudio"
                    // Since this is TEXT input, we do NOT generate.
                    shouldGenerate = false;
                    console.log('[Audio] Text Input + AudioOnly Mode -> Skipping Audio.');
                } else if (integrator.responseType === 'percentage') {
                    // UI: "Responder em áudio aleatoriamente (% das mensagens)"
                    const probability = parseInt(integrator.responsePercentage || 50, 10);
                    const randomVal = Math.random() * 100;

                    if (randomVal <= probability) {
                        shouldGenerate = true;
                        console.log(`[Audio] Probability Hit: ${randomVal.toFixed(0)} <= ${probability} -> Generating.`);
                    } else {
                        console.log(`[Audio] Probability Miss: ${randomVal.toFixed(0)} > ${probability} -> Skipping.`);
                    }
                }
            }

            if (shouldGenerate) {
                try {
                    let voiceId = integrator.voiceId || integrator.elevenLabsVoiceId || globalConfig?.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';

                    // Fallback for Agent IDs (Now supported via resolution)
                    let resolvedVoiceId = voiceId;
                    if (voiceId.startsWith('agent_')) {
                        const foundId = await resolveVoiceFromAgent(voiceId, apiKey);
                        if (foundId) {
                            resolvedVoiceId = foundId;
                        } else {
                            console.warn(`Could not resolve Agent ID. Falling back to default.`);
                            resolvedVoiceId = '21m00Tcm4TlvDq8ikWAM';
                        }
                    }

                    console.log(`[Audio Debug] Generating Audio using VoiceID: ${resolvedVoiceId}`);

                    // Use Helper (which handles Preprocessing + Phonetics)
                    // use textForAudio (Script) if available, otherwise aiResponse
                    const textToSpeak = textForAudio || aiResponse;

                    audioBase64 = await generateAudio(textToSpeak, apiKey, resolvedVoiceId);
                } catch (audioError) {
                    console.error('Audio Generation Error:', audioError);
                }
            }
        }

        return { aiResponse, audioBase64, productImageUrl, productCaption, pdfBase64, pdfName, messageChunks, calledCatalog };

    } catch (error) {
        console.error('[ProcessChat] Critical Error:', error);
        return {
            aiResponse: "Desculpe, ocorreu um erro interno ao processar sua mensagem.",
            messageChunks: [{ type: 'text', content: "Desculpe, ocorreu um erro interno." }]
        };
    }
};

// --- Config History Routes ---
app.get('/api/config/history', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const { agentId } = req.query;
    try {
        let config;
        if (agentId) {
            config = await prisma.agentConfig.findFirst({ where: { id: agentId, companyId } });
        } else {
            // Deprecated fallback: get first agent if no ID provided
            config = await prisma.agentConfig.findFirst({ where: { companyId } });
        }
        
        if (!config) return res.json([]);

        const history = await prisma.promptHistory.findMany({
            where: { agentConfigId: config.id },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        res.json(history);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar histórico' });
    }
});

app.post('/api/config/restore', authenticateToken, async (req, res) => {
    const { historyId } = req.body;
    const companyId = req.user.companyId;

    try {
        const historyItem = await prisma.promptHistory.findUnique({ 
            where: { id: historyId },
            include: { agentConfig: true }
        });
        
        if (!historyItem || historyItem.agentConfig.companyId !== companyId) {
            return res.status(404).json({ message: 'Versão não encontrada ou acesso negado' });
        }

        await prisma.agentConfig.update({ 
            where: { id: historyItem.agentConfigId },
            data: { systemPrompt: historyItem.systemPrompt }
        });

        res.json({ success: true, message: 'Prompt restaurado com sucesso' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao restaurar versão' });
    }
});





// --- Chat Endpoint (Protected - Panel Test) ---
app.post('/api/chat', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const { message, history, systemPrompt: overridePrompt, useConfigPrompt = true } = req.body;

    console.log(`[API Chat] Request received from Company: ${companyId}`);
    if (!message) return res.status(400).json({ error: 'Message required' });

    try {
        console.log('[API Chat] Fetching config...');
        const config = await getCompanyConfig(companyId);
        if (!config) {
            console.error(`[API Chat] Config not found for company ${companyId}`);
            return res.status(404).json({ error: 'Company config not found' });
        }
        console.log('[API Chat] Config loaded. Calling processChatResponse...');

        // Allow override for Test Panel
        if (!useConfigPrompt && overridePrompt) {
            config.systemPrompt = overridePrompt;
        }

        const { aiResponse, audioBase64, productImageUrl, pdfBase64, pdfName } = await processChatResponse(config, message, history, null);

        // Persist Chat (Test Mode - No Session)
        try {
            await prisma.testMessage.create({ data: { companyId, sender: 'user', text: message } });
            await prisma.testMessage.create({ data: { companyId, sender: 'ai', text: aiResponse } });
        } catch (dbError) {
            console.error('Failed to save chat history:', dbError);
        }

        res.json({ response: aiResponse, audio: audioBase64, image: productImageUrl, pdf: pdfBase64, pdfName });

    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: error.message || 'Error processing chat' });
    }
});

app.get('/api/chat/history', authenticateToken, async (req, res) => {
    try {
        const { agentId } = req.query;
        const where = { companyId: req.user.companyId };
        
        // If agentId is provided, filter by it (stored in owner field for test messages)
        if (agentId) {
            where.owner = agentId;
        }

        const history = await prisma.testMessage.findMany({
            where: where,
            orderBy: { createdAt: 'asc' }, // Oldest first
            take: 50 // Limit to last 50
        });

        // Map to frontend format
        const formatted = history.map(h => ({
            id: h.id, // String UUID
            sender: h.sender,
            text: h.text
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ message: 'Failed to fetch history' });
    }
});

app.delete('/api/chat/history', authenticateToken, async (req, res) => {
    try {
        const { agentId } = req.query;
        if (!agentId) return res.status(400).json({ message: 'agentId required' });

        await prisma.testMessage.deleteMany({
            where: { 
                companyId: req.user.companyId,
                owner: agentId
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing history:', error);
        res.status(500).json({ message: 'Failed to clear history' });
    }
});


// --- PROMP API INTEGRATION ---


app.post('/api/promp/connect', authenticateToken, async (req, res) => {
    try {
        const { apiUrl, apiToken } = req.body;

        if (!apiUrl || !apiToken) {
            return res.status(400).json({ message: 'URL da API e Bearer Token são obrigatórios.' });
        }

        console.log(`[Promp] Iniciando conexão manual com URL: ${apiUrl}`);

        // 1. Extrair o UUID da URL
        let prompUuid = '';
        const uuidMatch = apiUrl.match(/external\/([a-f0-9-]+)/i);
        if (uuidMatch && uuidMatch[1]) {
            prompUuid = uuidMatch[1];
        } else {
            const parts = apiUrl.split('/').filter(Boolean);
            const lastPart = parts[parts.length - 1];
            if (lastPart && lastPart.includes('-')) {
                prompUuid = lastPart;
            }
        }

        if (!prompUuid) {
            return res.status(400).json({ message: 'Não foi possível extrair o UUID da URL fornecida.' });
        }

        const prompToken = apiToken.replace('Bearer ', '').trim();

        // 2. Validação Imediata: Tentar listar canais com esses dados
        console.log(`[Promp] Validando conexão manual para UUID: ${prompUuid}...`);
        
        // Padrão de URL validado pelo usuário no Postman
        const validateUrl = `${PROMP_BASE_URL}/v2/api/external/${prompUuid}/listChannels`;
        
        try {
            const vRes = await fetch(validateUrl, {
                headers: { 'Authorization': `Bearer ${prompToken}` }
            });

            if (!vRes.ok) {
                const errTxt = await vRes.text();
                console.error(`[Promp] Falha na validação manual (Status ${vRes.status}):`, errTxt);
                return res.status(vRes.status).json({ 
                    message: 'A Promp recusou a conexão. Verifique se a URL e o Token estão corretos.' 
                });
            }

            const channelsData = await vRes.json();
            const channels = Array.isArray(channelsData) ? channelsData : (channelsData.channels || channelsData.data || []);
            
            console.log(`[Promp] Conexão MANUAL validada! Canais: ${channels.length}`);

            // 3. Persistir Globalmente na Company
            await prisma.company.update({
                where: { id: req.user.companyId },
                data: {
                    prompUuid: prompUuid,
                    prompToken: prompToken
                }
            });

            return res.json({ 
                success: true, 
                message: 'Integração Promp configurada e validada com sucesso!',
                prompUuid,
                channelCount: channels.length
            });

        } catch (e) {
            console.error(`[Promp] Erro de rede na validação:`, e.message);
            return res.status(500).json({ message: 'Erro de rede ao validar conexão com a Promp.' });
        }

    } catch (error) {
        console.error('Promp Connect Error:', error);
        res.status(500).json({ message: error.message || 'Erro inesperado na conexão Promp' });
    }
});


// --- GLOBAL CHANNELS API (List and Link) ---
app.get('/api/promp/channels', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.companyId;

        // Fetch global promp integration from Company
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { prompUuid: true, prompToken: true }
        });

        if (!company || !company.prompUuid || !company.prompToken) {
            return res.json({ channels: [] }); // Not integrated globally yet
        }

        const url = `${PROMP_BASE_URL}/v2/api/external/${company.prompUuid}/listChannels`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${company.prompToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('[Promp] Failed to list channels:', await response.text());
            return res.status(response.status).json({ message: 'Erro ao buscar canais na Promp' });
        }

        const data = await response.json();
        
        // Also fetch from DB to see which are already linked to which agents
        const linkedChannels = await prisma.prompChannel.findMany({
            where: { companyId },
            include: { agents: { select: { id: true, name: true } } }
        });

        // Map backend channels and embellish with DB links
        let finalChannels = [];
        const incomingChannels = Array.isArray(data) ? data : (data.channels || data.data || []);
        
        if (incomingChannels && Array.isArray(incomingChannels)) {
            finalChannels = incomingChannels.map(ch => {
                const dbMatch = linkedChannels.find(l => String(l.prompConnectionId) === String(ch.id) || String(l.prompConnectionId) === String(ch.wabaId) || String(l.name) === String(ch.name));
                return {
                    ...ch,
                    dbId: dbMatch ? dbMatch.id : null,
                    linkedAgents: dbMatch ? dbMatch.agents : [],
                    hasSpecificCreds: dbMatch ? (!!dbMatch.prompUuid && !!dbMatch.prompToken && dbMatch.prompUuid !== company.prompUuid) : false,
                    prompUuid: dbMatch ? dbMatch.prompUuid : null,
                    prompToken: dbMatch ? dbMatch.prompToken : null
                };
            });
        }

        res.json({ channels: finalChannels });
    } catch (e) {
        console.error('Error fetching global channels:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/promp/channels/link', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { agentId, channelObj, link } = req.body; // link = true (connect), false (disconnect)

        if (!agentId || !channelObj) {
            return res.status(400).json({ message: 'agentId e channelObj são obrigatórios.' });
        }

        const connectionId = String(channelObj.wabaId || channelObj.id || channelObj.name);
        
        // CRITICAL FIX: Separate Token and UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        // 1. Resolve Credentials (Priority: Explicit Body > Incoming Object)
        let prompToken = req.body.prompToken || null;
        let prompUuid = req.body.prompUuid || null;

        // 2. Ensure channel exists in DB
        let channelRecord = await prisma.prompChannel.findFirst({
            where: { 
                companyId, 
                OR: [
                    { prompConnectionId: connectionId },
                    { prompIdentity: String(channelObj.id) }
                ]
            }
        });

        if (!channelRecord) {
            // --- NEW CHANNEL CREATION FLOW ---
            // If creation, we NEED a UUID, so resolve with fallbacks
            if (!prompUuid) prompUuid = channelObj.prompUuid || channelObj.uuid || null;
            
            // Fallback for prompUuid if still missing
            if (!prompUuid) {
                if (uuidRegex.test(connectionId)) prompUuid = connectionId;
                else if (uuidRegex.test(channelObj.id)) prompUuid = String(channelObj.id);
            }
            if (!prompUuid) prompUuid = connectionId;

            channelRecord = await prisma.prompChannel.create({
                data: {
                    companyId,
                    name: channelObj.name || `Canal ${connectionId}`,
                    prompConnectionId: connectionId,
                    prompIdentity: String(channelObj.number || channelObj.id).replace(/\D/g, ''),
                    prompUuid: prompUuid, 
                    prompToken: prompToken
                }
            });
        } else {
            // --- EXISTING CHANNEL UPDATE FLOW ---
            // Update credentials ONLY if they were EXPLICITLY provided in the request body
            // This prevents the 'r96' fallback from overwriting a valid UUID during simple linking.
            const updates = {};
            if (prompToken && channelRecord.prompToken !== prompToken) updates.prompToken = prompToken;
            if (prompUuid && channelRecord.prompUuid !== prompUuid) updates.prompUuid = prompUuid;

            if (Object.keys(updates).length > 0) {
                channelRecord = await prisma.prompChannel.update({
                    where: { id: channelRecord.id },
                    data: updates
                });
            }
        }

        // 2. Link or Unlink agent
        if (link) {
            // VERIFY CREDENTIALS (Mandatory Flow)
            if (!prompToken && !channelRecord.prompToken) {
                return res.status(400).json({ message: 'Este canal precisa de um Token específico antes de ser vinculado.' });
            }
            if (!prompUuid && !channelRecord.prompUuid) {
                 return res.status(400).json({ message: 'Este canal precisa de uma URL de API válida antes de ser vinculado.' });
            }

            await prisma.prompChannel.update({
                where: { id: channelRecord.id },
                data: { agents: { connect: { id: agentId } } }
            });
        } else {
            await prisma.prompChannel.update({
                where: { id: channelRecord.id },
                data: { agents: { disconnect: { id: agentId } } }
            });
        }

        res.json({ success: true, message: link ? 'Canal vinculado' : 'Canal desvinculado' });

    } catch (e) {
        console.error('Error linking channel:', e);
        res.status(500).json({ error: e.message });
    }
});


// --- Webhook Integration (Public) ---
// Generic Webhook Fallback (if companyId missing in URL)
app.post('/webhook', async (req, res) => {
    console.log('[Webhook] Received request on generic /webhook endpoint (No ID).');

    // Try to find a default company or extract from payload
    // This is a Safety Net for misconfigured integrations.
    const firstCompany = await prisma.company.findFirst();
    if (firstCompany) {
        console.log(`[Webhook] Redirecting to Company ${firstCompany.id}`);
        // Internally forward or redirect? 
        // Better to just call the handler or duplicate logic?
        // Let's redirect 307 to the correct URL if possible, or handle it here.
        // Since this is S2S, redirect might not be followed.
        // We'll just call the logic via internal redirect if we could, but express doesn't support internal dispatch easily.
        // We'll just return an error telling them to configure the URL correctly.
        console.error('[Webhook] ERROR: Integration URL is missing Company ID. Use: /webhook/' + firstCompany.id);
        return res.status(400).json({
            error: 'Webhook URL must include Company ID',
            correctUrl: `/webhook/${firstCompany.id}`,
            example: `https://seu-dominio.com/webhook/${firstCompany.id}`
        });
    }
    res.status(400).send('Missing Company ID in URL');
});

// Webhook Handlers (Defined explicitly for compatibility)

// --- HELPER: Resolve Product Image from Config ---
function resolveProductImageFromConfig(targetId, config) {
    if (!config || !config.products) return { found: false, error: 'Lista de produtos vazia' };

    // CRITICAL FIX: Parse products if stringified
    let products = typeof config.products === 'string' ? JSON.parse(config.products) : config.products;
    if (!Array.isArray(products)) return { found: false, error: 'Formato de produtos inválido' };

    let cleanId = String(targetId).trim();
    console.log(`[ImageResolution] Searching for Image. Target: "${cleanId}" in ${products.length} products.`);

    const hidePrices = config.catalogConfig?.hidePrices || false;

    // ─── PASS 1: EXACT ID MATCH (Parent and Variants) ───────────────────────────
    for (const p of products) {
        // Check Parent - Exact ID
        if (String(p.id) === cleanId) {
            if (p.image) {
                console.log(`[ImageResolution] FOUND by exact parent ID: ${cleanId}`);
                const caption = hidePrices ? p.name : `${p.name} - R$ ${p.price}`;
                return { found: true, url: p.image, caption };
            } else {
                console.log(`[ImageResolution] Product ${cleanId} exists but has NO IMAGE`);
                return { found: false, productExists: true, productName: p.name, error: `O produto "${p.name}" não tem imagem` };
            }
        }

        // Check Variants - Exact ID
        if (p.variantItems) {
            const variant = p.variantItems.find(v => String(v.id) === cleanId);
            if (variant) {
                if (variant.image || p.image) {
                    const details = [variant.color, variant.size].filter(Boolean).join(' / ');
                    console.log(`[ImageResolution] FOUND VARIANT by exact ID: ${cleanId} (Parent: ${p.name})`);
                    const caption = hidePrices ? `${p.name} - ${details}` : `${p.name} - ${details} - R$ ${variant.price || p.price}`;
                    return { found: true, url: variant.image || p.image, caption };
                } else {
                    console.log(`[ImageResolution] Variant ${cleanId} found but has NO IMAGE`);
                    return { found: false, productExists: true, error: `Variação sem imagem` };
                }
            }
        }
    }

    // ─── PASS 2: WBUY NUMERIC ID FALLBACK ─────────────────────────────────────
    // IDs Wbuy têm padrão: wbuy_{wbuyId}_{timestamp} ou var_{wbuyId}_{varId}_{timestamp}
    // O timestamp muda a cada ressincronização, então tentamos extrair o wbuyId numérico.
    const wbuyParentMatch = cleanId.match(/^wbuy_(\d+)_\d+$/);
    const wbuyVarMatch = cleanId.match(/^var_(\d+)_(\d+)_\d+$/);

    if (wbuyParentMatch) {
        const wbuyId = wbuyParentMatch[1];
        // Buscar produto cujo próprio ID começa com wbuy_{wbuyId}_
        const found = products.find(p => String(p.id).startsWith(`wbuy_${wbuyId}_`));
        if (found && found.image) {
            console.log(`[ImageResolution] FOUND by wbuyId fallback: ${wbuyId} -> ${found.id}`);
            const caption = hidePrices ? found.name : `${found.name} - R$ ${found.price}`;
            return { found: true, url: found.image, caption };
        }
        if (found) {
            return { found: false, productExists: true, productName: found.name, error: `Produto sem imagem` };
        }
    }

    if (wbuyVarMatch) {
        const wbuyId = wbuyVarMatch[1];
        const varId = wbuyVarMatch[2];
        // Buscar produto cujo ID começa com wbuy_{wbuyId}_ e variação com var_{wbuyId}_{varId}_
        for (const p of products) {
            if (String(p.id).startsWith(`wbuy_${wbuyId}_`) && p.variantItems) {
                const variant = p.variantItems.find(v => String(v.id).startsWith(`var_${wbuyId}_${varId}_`));
                if (variant && (variant.image || p.image)) {
                    const details = [variant.color, variant.size].filter(Boolean).join(' / ');
                    console.log(`[ImageResolution] FOUND VARIANT by wbuyId fallback: var_${wbuyId}_${varId} (Parent: ${p.name})`);
                    const caption = hidePrices ? `${p.name} - ${details}` : `${p.name} - ${details} - R$ ${variant.price || p.price}`;
                    return { found: true, url: variant.image || p.image, caption };
                }
            }
        }
    }

    // ─── PASS 3: LOOSE NAME MATCH ──────────────────────────────────────────────
    for (const p of products) {
        if (p.name && p.name.toLowerCase().includes(cleanId.toLowerCase())) {
            if (p.image) {
                console.log(`[ImageResolution] FOUND by name match: "${cleanId}" in "${p.name}"`);
                const caption = hidePrices ? p.name : `${p.name} - R$ ${p.price}`;
                return { found: true, url: p.image, caption };
            }
        }
    }

    console.log(`[ImageResolution] NOT FOUND for: "${cleanId}"`);
    return { found: false, error: `Produto com ID ${cleanId} não encontrado` };
};



// --- MULTIPLE AGENTS (AgentConfig) ROUTES ---
app.get('/api/agents', authenticateToken, async (req, res) => {
    try {
        const agents = await prisma.agentConfig.findMany({
            where: { companyId: req.user.companyId },
            include: { prompChannels: true }
        });
        res.json(agents);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/agents', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        const newAgent = await prisma.agentConfig.create({
            data: {
                companyId: req.user.companyId,
                name: name || 'Novo Agente'
            }
        });
        res.json(newAgent);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/agents/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.agentConfig.deleteMany({
            where: { id: req.params.id, companyId: req.user.companyId }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- CHANNELS ROUTES ---
app.get('/api/channels', authenticateToken, async (req, res) => {
    try {
        const channels = await prisma.prompChannel.findMany({
            where: { companyId: req.user.companyId },
            include: { agents: true }
        });
        res.json(channels);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/channels/:id/link-agent', authenticateToken, async (req, res) => {
    try {
        const { agentId, action } = req.body; // action: 'connect' or 'disconnect'
        const channelId = req.params.id;
        
        const channel = await prisma.prompChannel.findFirst({
            where: { id: channelId, companyId: req.user.companyId }
        });
        const agent = await prisma.agentConfig.findFirst({
            where: { id: agentId, companyId: req.user.companyId }
        });
        
        if (!channel || !agent) return res.status(404).json({ error: 'Not found' });

        if (action === 'connect') {
            await prisma.prompChannel.update({
                where: { id: channelId },
                data: { agents: { connect: { id: agentId } } }
            });
        } else {
            await prisma.prompChannel.update({
                where: { id: channelId },
                data: { agents: { disconnect: { id: agentId } } }
            });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/channels/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.prompChannel.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/channels/:id/whatsapp-test', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled, phoneNumber } = req.body;
        const channel = await prisma.prompChannel.findFirst({
            where: { id, companyId: req.user.companyId }
        });
        if (!channel) return res.status(404).json({ error: 'Canal não encontrado' });
        const updated = await prisma.prompChannel.update({
            where: { id },
            data: {
                whatsappTestMode: !!enabled,
                whatsappTestNumber: phoneNumber ? String(phoneNumber).replace(/\D/g, '') : null
            }
        });
        lastChannelsCacheTime = 0;
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── CRM Automation Routes ──────────────────────────────────────────────────

// GET /api/crm-automation/pipelines — lista pipelines do tenant
app.get('/api/crm-automation/pipelines', authenticateToken, async (req, res) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true },
        });
        if (!company?.prompUuid || !company?.prompToken) {
            return res.status(400).json({ success: false, message: 'Credenciais Promp não configuradas para esta empresa.' });
        }
        const data = await listCrmPipelines(company.prompUuid, company.prompToken);
        res.json(data);
    } catch (e) {
        console.error('[CRM] listPipelines error:', e.message);
        res.status(502).json({ success: false, message: 'Não foi possível conectar ao CRM. Verifique suas credenciais.' });
    }
});

// GET /api/crm-automation/users — lista atendentes do tenant no Promp
app.get('/api/crm-automation/users', authenticateToken, async (req, res) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true },
        });
        if (!company?.prompUuid || !company?.prompToken) {
            return res.status(400).json({ success: false, message: 'Credenciais Promp não configuradas.' });
        }
        const { pageNumber = '1', searchParam = '' } = req.query;
        const data = await listCrmUsers(company.prompUuid, company.prompToken, Number(pageNumber), searchParam);
        res.json(data);
    } catch (e) {
        console.error('[CRM] listUsers error:', e.message);
        res.status(502).json({ success: false, message: 'Erro ao buscar usuários.' });
    }
});


app.get('/api/crm-automation/opportunities', authenticateToken, async (req, res) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true },
        });
        if (!company?.prompUuid || !company?.prompToken) {
            return res.status(400).json({ success: false, message: 'Credenciais Promp não configuradas.' });
        }
        const { page = '1', limit = '40', status = 'open', pipelineId } = req.query;
        const data = await listCrmOpportunities(company.prompUuid, company.prompToken, {
            page: Number(page), limit: Number(limit), status, pipelineId: pipelineId ? Number(pipelineId) : undefined,
        });
        res.json(data);
    } catch (e) {
        console.error('[CRM] listOpportunities error:', e.message);
        res.status(502).json({ success: false, message: 'Erro ao buscar oportunidades.' });
    }
});

// GET /api/crm-automation/config — retorna config de automação salva
app.get('/api/crm-automation/config', authenticateToken, async (req, res) => {
    try {
        const { pipelineId } = req.query;
        const where = { companyId: req.user.companyId };
        if (pipelineId) where.pipelineId = Number(pipelineId);
        const automations = await prisma.pipelineAutomation.findMany({ where });
        res.json({ success: true, data: automations });
    } catch (e) {
        console.error('[CRM] getConfig error:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/crm-automation/config — cria nova automação de funil
app.post('/api/crm-automation/config', authenticateToken, async (req, res) => {
    try {
        const { pipelineId, pipelineName, stages, entryTrigger, isActive } = req.body;
        if (!pipelineId || !pipelineName || !stages) {
            return res.status(400).json({ success: false, message: 'pipelineId, pipelineName e stages são obrigatórios.' });
        }
        const existing = await prisma.pipelineAutomation.findFirst({
            where: { companyId: req.user.companyId, pipelineId: Number(pipelineId) },
        });
        if (existing) {
            return res.status(409).json({ success: false, message: 'Já existe automação para este pipeline. Use PUT para atualizar.' });
        }
        const automation = await prisma.pipelineAutomation.create({
            data: {
                companyId: req.user.companyId,
                pipelineId: Number(pipelineId),
                pipelineName,
                stages: JSON.stringify(stages),
                entryTrigger: entryTrigger ? JSON.stringify(entryTrigger) : null,
                isActive: isActive !== false,
            },
        });
        res.json({ success: true, data: automation });
    } catch (e) {
        console.error('[CRM] createConfig error:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUT /api/crm-automation/config/:id — atualiza automação existente
app.put('/api/crm-automation/config/:id', authenticateToken, async (req, res) => {
    try {
        const automation = await prisma.pipelineAutomation.findFirst({
            where: { id: req.params.id, companyId: req.user.companyId },
        });
        if (!automation) return res.status(404).json({ success: false, message: 'Automação não encontrada.' });

        const { pipelineName, stages, entryTrigger, isActive } = req.body;
        const updated = await prisma.pipelineAutomation.update({
            where: { id: req.params.id },
            data: {
                ...(pipelineName && { pipelineName }),
                ...(stages && { stages: JSON.stringify(stages) }),
                ...(entryTrigger !== undefined && { entryTrigger: entryTrigger ? JSON.stringify(entryTrigger) : null }),
                ...(isActive !== undefined && { isActive }),
            },
        });
        res.json({ success: true, data: updated });
    } catch (e) {
        console.error('[CRM] updateConfig error:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/crm-automation/monitor — oportunidades ativas com histórico e logs
app.get('/api/crm-automation/monitor', authenticateToken, async (req, res) => {
    try {
        const { pipelineId } = req.query;
        const where = { companyId: req.user.companyId, isActive: true };
        if (pipelineId) {
            const automation = await prisma.pipelineAutomation.findFirst({
                where: { companyId: req.user.companyId, pipelineId: Number(pipelineId) },
            });
            if (automation) where.automationId = automation.id;
        }
        const opportunities = await prisma.activeOpportunity.findMany({
            where,
            include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
            orderBy: { updatedAt: 'desc' },
        });
        res.json({ success: true, data: opportunities });
    } catch (e) {
        console.error('[CRM] monitor error:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/crm-automation/evaluate/:opportunityId — força avaliação manual
app.post('/api/crm-automation/evaluate/:opportunityId', authenticateToken, async (req, res) => {
    try {
        const opp = await prisma.activeOpportunity.findFirst({
            where: { id: req.params.opportunityId, companyId: req.user.companyId },
            include: { automation: true },
        });
        if (!opp) return res.status(404).json({ success: false, message: 'Oportunidade não encontrada.' });

        const company = await prisma.company.findUnique({
            where: { id: req.user.companyId },
            select: { prompUuid: true, prompToken: true },
        });

        const { evaluateLeadProgression } = await import('./crmAutomation.js');
        const globalConfig = await prisma.globalConfig.findFirst();
        const openaiKey = globalConfig?.openaiKey || process.env.OPENAI_API_KEY;
        if (!openaiKey) return res.status(400).json({ success: false, message: 'Chave OpenAI não configurada.' });

        const { OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: openaiKey });

        const stages = JSON.parse(opp.automation.stages || '[]');
        const stageConfig = stages.find(s => s.stageId === opp.currentStageId);
        if (!stageConfig?.advanceCondition) {
            return res.status(400).json({ success: false, message: 'Etapa sem condição de avanço configurada.' });
        }
        const nextStages = stages
            .filter(s => s.stageOrder > stageConfig.stageOrder)
            .sort((a, b) => a.stageOrder - b.stageOrder);

        const history = opp.conversationHistory ? JSON.parse(opp.conversationHistory) : [];
        const lead = {
            contactName: opp.contactName,
            contactNumber: opp.contactNumber,
            opportunityName: opp.opportunityName,
            currentStage: opp.currentStageName,
            daysInCurrentStage: Math.floor((Date.now() - new Date(opp.stageEnteredAt).getTime()) / 86_400_000),
            conversationHistory: history.length ? history.slice(-20).map(m => `[${m.role}]: ${m.content}`).join('\n') : null,
        };

        const evaluation = await evaluateLeadProgression(
            lead, stageConfig.advanceCondition,
            nextStages.map(s => ({ id: s.stageId, name: s.stageName, order: s.stageOrder })),
            openai
        );
        res.json({ success: true, evaluation });
    } catch (e) {
        console.error('[CRM] evaluate error:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// Handle React Routing (SPA) - must be the last route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});




// --- SERVER STARTUP ---
const startServer = async () => {
    try {
        console.log('[Startup] Connecting to Database...');
        await prisma.$connect();
        console.log('[Startup] Database Connected.');

        app.listen(PORT, () => {
            console.log(`[Startup] Server running on port ${PORT}`);
            console.log('[Startup] Health Check available at /api/health');
        });
    } catch (e) {
        console.error('[Startup] FATAL ERROR: Database connection failed.', e);
        // Do not exit, allow server to run for static file serve or minimal health check
        // But maybe it's better to crash?
        process.exit(1);
    }
};

startServer();
