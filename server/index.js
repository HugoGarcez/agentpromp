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

// Helper for file logging
const logFlow = (msg) => {
    try {
        const timestamp = new Date().toISOString();
        fsCommon.appendFileSync('debug_flow.txt', `[${timestamp}] ${msg}\n`);
    } catch (e) { /* ignore */ }
};
import { initScheduler } from './scheduler.js';
import { extractFromUrl } from './extractor.js';
import {
    generateAuthUrl,
    handleOAuthCallback,
    listCalendars,
    checkAvailability,
    createCalendarEvent
} from './googleCalendar.js';
import { sendPrompMessage, getPrompTags, applyPrompTag, sendPrompPresence, downloadAndDecryptWhatsAppMedia } from './prompUtils.js';

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
    const { companyId } = req.params;
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
    try {
        config = await prisma.agentConfig.findUnique({ where: { companyId } });
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
        payload.ticket?.uniqueId; // Add more candidates

    if (msgId) {
        if (processedMessages.has(msgId)) {
            console.log(`[Webhook] Duplicate Message ID ${msgId}. Ignoring.`);
            return res.json({ status: 'ignored_duplicate' });
        }
        processedMessages.add(msgId);
        // Clear from memory after 15 seconds
        setTimeout(() => processedMessages.delete(msgId), 15000);
    }

    // ------------------------------------------------------------------
    // LOOP PROTECTION & SENDER IDENTITY
    // ------------------------------------------------------------------

    // 1. Check "wasSentByApi" (Explicit flag from some Providers)
    // If true, it is DEFINITELY the bot/agent.
    if (payload.wasSentByApi || payload.msg?.wasSentByApi || payload.data?.wasSentByApi) {
        console.log('[Webhook] Loop Protection: Message marked as "wasSentByApi". Ignoring.');
        return res.json({ status: 'ignored_api_sent' });
    }

    // 2. Identify Sender
    const rawSender = payload.key?.remoteJid || payload.contact?.number || payload.body?.contact?.number || payload.number || payload.data?.key?.remoteJid || payload.msg?.from || payload.msg?.sender;
    const cleanSender = rawSender ? String(rawSender).replace(/\D/g, '') : '';

    // 3. Identify Protocol Owner (The session/bot number)
    const rawOwner = payload.msg?.owner || payload.owner;
    const cleanOwner = rawOwner ? String(rawOwner).replace(/\D/g, '') : null;

    // 4. Identify Configured Identity & Connection ID (From DB)
    let dbIdentity = null;
    let dbConnectionId = null;
    if (config) {
        if (config.prompIdentity) dbIdentity = String(config.prompIdentity).replace(/\D/g, '');
        if (config.prompConnectionId) dbConnectionId = String(config.prompConnectionId).trim(); // Keep alphanumeric for session names
    }

    // --- V6 REAL-TIME DIAGNOSTIC RECURSIVE ID FINDER ---
    console.log(`[Webhook-V6-ENV] PID: ${process.pid} | CWD: ${process.cwd()} | File: ${__filename}`);

    const foundIds = new Set();
    const findIdsRecursively = (obj, currentPath = 'payload') => {
        if (!obj || typeof obj !== 'object') return;

        // Check for common keys
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            const newPath = `${currentPath}.${key}`;

            if (key === 'whatsappId' || (key === 'id' && currentPath.endsWith('.whatsapp'))) {
                if (val !== null && val !== undefined) {
                    const strVal = String(val).trim();
                    console.log(`[Webhook-V6-DIAG] Found candidate ID '${strVal}' at: ${newPath}`);
                    foundIds.add(strVal);
                }
            }

            // Recurse
            if (val && typeof val === 'object') {
                findIdsRecursively(val, newPath);
            }
        }
    };

    findIdsRecursively(payload);
    const incomingConnectionIdArr = Array.from(foundIds);

    if (dbConnectionId) {
        if (incomingConnectionIdArr.length === 0) {
            console.log(`[Webhook-V6] ERROR: No WhatsApp ID found in payload (Recursive Search). Expected: '${dbConnectionId}'. Ignoring.`);
            return res.json({ status: 'ignored_missing_whatsapp_id' });
        }

        const hasMatch = incomingConnectionIdArr.includes(dbConnectionId);

        if (!hasMatch) {
            console.log(`[Webhook-V6] CONNECTION ISOLATION: Expected ID '${dbConnectionId}' NOT FOUND. Candidates: ${JSON.stringify(incomingConnectionIdArr)}. Ignoring.`);
            return res.json({ status: 'ignored_wrong_whatsapp_id' });
        }

        console.log(`[Webhook-V6] CONNECTION MATCH VERIFIED: ID '${dbConnectionId}' found recursively.`);
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
    const isGroup = rawSender ? rawSender.includes('@g.us') : false;
    const isBroadcast = rawSender ? (rawSender.includes('broadcast') || rawSender.includes('@lid')) : false;

    // Check if messageType is present
    const messageType = payload.messageType || payload.type;
    const isProtocol = messageType === 'protocolMessage' || messageType === 'senderKeyDistributionMessage';

    if (rawSender && rawSender.includes('status@broadcast')) {
        console.log('[Webhook] Ignoring Status Update (status@broadcast).');
        return res.json({ status: 'ignored_status' });
    }

    if (isGroup) {
        console.log('[Webhook] Ignoring Group Message.');
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
                const firstAttempt = followUpCfg.attempts[0];
                const now = new Date();
                let nextDate = new Date();
                if (firstAttempt.delayUnit === 'minutes') nextDate.setMinutes(now.getMinutes() + firstAttempt.delayValue);
                if (firstAttempt.delayUnit === 'hours') nextDate.setHours(now.getHours() + firstAttempt.delayValue);
                if (firstAttempt.delayUnit === 'days') nextDate.setDate(now.getDate() + firstAttempt.delayValue);

                // UPSERT STATE for the USER (Target)
                await prisma.contactState.upsert({
                    where: { companyId_remoteJid: { companyId, remoteJid: targetJid } },
                    create: {
                        companyId,
                        remoteJid: targetJid,
                        isActive: true,
                        attemptIndex: 0,
                        lastOutbound: now,
                        nextFollowUp: nextDate
                    },
                    update: {
                        isActive: true,
                        attemptIndex: 0,
                        lastOutbound: now,
                        nextFollowUp: nextDate
                    }
                });
                console.log(`[FollowUp] Timer STARTED for ${cleanTarget}. Next: ${nextDate.toISOString()}`);
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
    if (payload.ticket && payload.ticket.status === 'open') {
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

    if (!userMessage) {
        console.log(`[Webhook] Payload from ${cleanSender} missing text content. Ignoring.`);
        return res.json({ status: 'ignored_no_text' });
    }

    // Support both N8N structure (ticket.id), Wuzapi (wuzapi.id), and pure Promp structure
    const sessionId = payload.ticket?.id || payload.wuzapi?.id || (payload.classes && payload.classes.length > 0 ? payload.classes[0] : null) || null;
    const senderNumber = payload.msg?.from ||
        payload.msg?.sender_pn ||
        payload.msg?.chatid ||
        payload.key?.remoteJid ||
        payload.contact?.number ||
        payload.number ||
        payload.data?.key?.remoteJid ||
        payload.msg?.sender;

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

        // 3. Process AI Response
        // Pass isAudioInput flag so AI can decide to reply with audio
        const { aiResponse, audioBase64, productImageUrl, productCaption, pdfBase64, messageChunks } = await processChatResponse(config, userMessage, history, dbSessionId, isAudioInput, currentTicketId, tagTriggers);


        console.log(`[Webhook] AI Response generated: "${aiResponse.substring(0, 50)}..."`);

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
                console.log(`[Webhook] Sending ${messageChunks.length} chunks via API...`);

                for (const [index, chunk] of messageChunks.entries()) {
                    if (chunk.type === 'image') {
                        const isFirstText = index === 0;
                        await sendPrompMessage(config, cleanNumber, null, null, chunk.url, chunk.caption);
                        await new Promise(r => setTimeout(r, 600));
                    } else if (chunk.type === 'text') {
                        const chunkAudio = (index === 0) ? audioBase64 : null;

                        // PRESENCE SIMULATION (Typing/Recording)
                        if (currentTicketId) {
                            const state = chunkAudio ? 'recording' : 'typing';
                            const charCount = chunk.content ? chunk.content.length : 0;
                            // Calculate delay based on length: 30ms per char for typing, min 1s, max 4.5s
                            const baseDelay = chunkAudio ? 3500 : Math.min(Math.max(charCount * 30, 1000), 4500);

                            await sendPrompPresence(config, currentTicketId, state);
                            await new Promise(r => setTimeout(r, baseDelay));
                            await sendPrompPresence(config, currentTicketId, 'paused');
                        }

                        // Se tiver áudio gerado, enviamos APENAS o áudio para evitar texto duplicado
                        const textToSend = chunkAudio ? null : chunk.content;
                        await sendPrompMessage(config, cleanNumber, textToSend, chunkAudio, null, null);
                        await new Promise(r => setTimeout(r, 800));
                    }
                }
                sentViaApi = true;

            } else {
                // FALLBACK FOR SINGLE MESSAGE CALL
                if (currentTicketId && (aiResponse || audioBase64)) {
                    const state = audioBase64 ? 'recording' : 'typing';
                    const charCount = aiResponse ? aiResponse.length : 0;
                    const baseDelay = audioBase64 ? 3500 : Math.min(Math.max(charCount * 30, 1000), 4500);

                    await sendPrompPresence(config, currentTicketId, state);
                    await new Promise(r => setTimeout(r, baseDelay));
                    await sendPrompPresence(config, currentTicketId, 'paused');
                }

                // Se tiver áudio gerado, enviamos APENAS o áudio para evitar texto duplicado
                const textToSend = audioBase64 ? null : aiResponse;
                sentViaApi = await sendPrompMessage(config, cleanNumber, textToSend, audioBase64, productImageUrl, productCaption, pdfBase64);
            }

            console.log(`[Webhook] Sent via API: ${sentViaApi}`);
        } else {
            console.log('[Webhook] Config missing prompUuid/Token. Falling back to JSON response.');
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
            const config = await prisma.agentConfig.findUnique({
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

// --- TAGS (Autotagging) Routes ---

// List tags directly from Promp API
app.get('/api/tags/promp', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.agentConfig.findUnique({
            where: { companyId: req.user.companyId }
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

// --- User Stats Route (Dashboard) ---
app.get('/api/stats', authenticateToken, async (req, res) => {
    const { companyId } = req.user;

    try {
        // 1. Fetch Config to get product definitions
        const config = await prisma.agentConfig.findUnique({
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
        let aiMessagesCount = 0;

        messages.forEach(msg => {
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

        res.json({
            desiredProducts: sortedDesired,
            soldProducts: sortedSold,
            activeCustomers: sortedCustomers,
            timeSaved: timeSavedFormatted,
            totalAiMessages: aiMessagesCount
        });

    } catch (error) {
        console.error('[Stats API] Error:', error);
        res.status(500).json({ error: 'Erro ao processar estatísticas' });
    }
});

// --- Notification Routes (User) ---
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { status: 'APPROVED' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar notificações' });
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


// --- Configuration Routes (Protected) ---

// Helper to get config from DB

const getCompanyConfig = async (companyId) => {
    if (!companyId) return null;

    try {
        const config = await prisma.agentConfig.findUnique({
            where: { companyId },
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

        return {
            ...config,
            persona: safeParse(config.persona),
            integrations: safeParse(config.integrations),
            products: safeParse(config.products),
            knowledgeBase: safeParse(config.knowledgeBase),
            followUpConfig: safeParse(config.followUpConfig),
            // Scheduling Data
            specialists: config.company?.specialists || [],
            appointmentTypes: config.company?.appointmentTypes || [],
            googleConfig: config.company?.googleConfig || null
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
        const currentConfig = await prisma.agentConfig.findUnique({ where: { companyId } });

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
            followUpConfig: newConfig.followUpConfig ? (typeof newConfig.followUpConfig === 'object' ? JSON.stringify(newConfig.followUpConfig) : newConfig.followUpConfig) : undefined
        };

        const updatedConfig = await prisma.agentConfig.upsert({
            where: { companyId },
            update: data,
            create: data,
        });

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
    try {
        const config = await getCompanyConfig(companyId);
        res.json(config || {});
    } catch (error) {
        console.error('Error fetching config:', error);
        res.status(500).json({ message: 'Error fetching config' });
    }
});

// --- GLOBAL CONFIG API (ADMIN) ---
app.post('/api/admin/config', authenticateToken, async (req, res) => {
    // Ideally check if req.user.role === 'ADMIN'
    // For now allowing any authenticated user to setup global keys if they know this route (User asked for "Unique configuration present in admin")
    // We assume the UI will protect access.
    try {
        const {
            openaiKey,
            geminiKey,
            elevenLabsKey,
            elevenLabsVoiceId,
            googleClientId,
            googleClientSecret,
            googleRedirectUri
        } = req.body;

        console.log('[GlobalConfig] Received Payload:', JSON.stringify(req.body, null, 2));

        // Upsert Global Config (Single Record logic)
        // We will stick to ID 'global_settings' or just take the first one.
        // Let's use a fixed ID or findFirst.

        const existing = await prisma.globalConfig.findFirst();

        if (existing) {
            await prisma.globalConfig.update({
                where: { id: existing.id },
                data: {
                    openaiKey,
                    geminiKey,
                    elevenLabsKey,
                    elevenLabsVoiceId,
                    googleClientId,
                    googleClientSecret,
                    googleRedirectUri
                }
            });
        } else {
            await prisma.globalConfig.create({
                data: {
                    openaiKey,
                    geminiKey,
                    elevenLabsKey,
                    elevenLabsVoiceId,
                    googleClientId,
                    googleClientSecret,
                    googleRedirectUri
                }
            });
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Error saving global config:', e);
        res.status(500).json({ error: 'Failed to save global config' });
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
    
    DIRETRIZES DE RESPOSTA:
    1. Seja direto e conciso. Evite enrolação.
    2. Separe cada ideia, frase ou parágrafo por uma QUEBRA DE LINHA DUPLA (dois enters).
    3. NUNCA envie blocos de texto gigantes.
    4. RESUMA AO MÁXIMO: Sua resposta total NÃO PODE passar de 5 frases curtas.
    5. O objetivo é que cada frase importante seja uma mensagem separada no WhatsApp (Max 5 balões).

    DIRETRIZES DE PRODUTOS/SERVIÇOS:
    1. NUNCA copie a descrição completa do produto/serviço.
    2. LISTAS: Máximo de 3 itens por mensagem. Agrupe os itens no mesmo balão (use quebra de linha simples).
    3. Se houver mais de 3 itens, cite os 3 principais e pergunte se o cliente quer ver o resto.
    4. Destaque apenas 2 ou 3 pontos principais (benefícios).
    5. Sempre termine perguntando se o cliente quer saber algo mais específico sobre o item (ex: medidas, cores, detalhes técnicos, formas de pagamentos).
    
    ⚠️ REGRAS CRÍTICAS SOBRE VARIAÇÕES E DETALHES:
    1. **[VARIAÇÕES]**: Se o item tem variações listadas em "variantItems":
       - Use APENAS as cores e tamanhos informados ali.
       - Identifique claramente: "Disponível na cor [COR] no tamanho [TAMANHO]".
       - Se os preços variarem, informe o preço específico daquela variação.
    
    2. **[ITEM ÚNICO]**: Se o item NÃO tem variações (ou é marcado como ITEM ÚNICO):
       - Diga que é "Tamanho único" ou "Modelo padrão".
       - PROIBIDO inventar tamanhos P, M, G se não estiverem na lista.

    3. **PAGAMENTOS E CONDIÇÕES**:
       - Informe as formas de pagamento disponíveis (Pix, Cartão, etc) e seus respectivos preços se houver desconto.
       - Cite as "paymentConditions" (ex: "parcelamento em 3x") se presentes.

    4. **FOTOS DE PRODUTOS**:
       - Se tem [TEM_IMAGEM], SEMPRE envie [SHOW_IMAGE: ID]
       - Use o ID do produto principal ou da variação se disponível.
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

                if (p.priceHidden) {
                    // If price is hidden, use the reason as the display text
                    let reason = p.priceHiddenReason || 'Sob consulta';
                    if (reason === 'Outro' && p.customPriceHiddenReason) {
                        reason = p.customPriceHiddenReason;
                    }
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
                productList += `- [${typeLabel}] ID: ${p.id} | Nome: ${p.name} | Preço: ${priceDisplay} / ${unitLabel}${priceDetails}. ${pdfTag} ${paymentLinkCtx}\n`;

                if (p.description) productList += `  Descrição: ${p.description}\n`;
                if (p.paymentConditions) productList += `  Condições: ${p.paymentConditions}\n`;

                // Variations (Only for Products usually, but code handles generically)
                if (p.variantItems && p.variantItems.length > 0) {
                    p.variantItems.forEach(v => {
                        // Check if image exists (Variant OR Parent Fallback)
                        const hasImage = v.image || p.image;
                        productList += `  -- [VARIAÇÃO] ID: ${v.id} | ${v.name} (${v.color || ''} ${v.size || ''}) | R$ ${v.price || p.price} | ${hasImage ? '[TEM_IMAGEM]' : ''}\n`;
                    });
                } else {
                    // Simple Item - IMAGEM OBRIGATÓRIA
                    const imageInstruction = p.image ? '[TEM_IMAGEM] ⚠️ USE: [SHOW_IMAGE: ' + p.id + ']' : '';
                    productList += `  -- [ITEM ÚNICO] ID: ${p.id} | ${imageInstruction}\n`;
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

EXEMPLO CORRETO para "Camisa do Herói" (ID: 1770083712009):
"Aqui está a foto! 👕
[SHOW_IMAGE: 1770083712009]"

❌ JAMAIS FAÇA: "Aqui está a foto! 👕" (SEM A TAG)
❌ JAMAIS FAÇA: "Vou enviar a imagem..." (SEM A TAG)

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

EXEMPLO:
Function retorna: {id: "1770083712009", name: "Camisa Herói", hasImage: true}
Usuário: "Foto da camisa herói"
Resposta: "Aqui está a foto! 👕 [SHOW_IMAGE: 1770083712009]"
═══════════════════════════════════════════════════════════════

`;

            systemPrompt += `DIRETRIZES DE MÍDIA E VENDAS (CRÍTICO):\n`;
            systemPrompt += `1. IMAGENS: Se o cliente pedir qualquer referência visual, use a tag [SHOW_IMAGE: ID]. (Veja regras de interpretação abaixo).\n`;
            systemPrompt += `2. PDF DE SERVIÇO: Se o cliente pedir detalhes de um serviço com [TEM_PDF], EXPLIQUE o serviço em texto e PERGUNTE: "Gostaria de receber o PDF com mais detalhes?". SE O CLIENTE CONFIRMAR, responda: "[SEND_PDF: ID] Enviando o arquivo...".\n`;
            systemPrompt += `3. PAGAMENTO: Se o cliente quiser comprar/contratar e o item tiver [TEM_LINK_PAGAMENTO], envie o link: "[LINK: URL_DO_PAGAMENTO] Clique aqui para finalizar.".\n`;
            systemPrompt += `4. PREÇO/CONDIÇÕES: Use as informações de preço e condições (se houver) para negociar.\n`;
            systemPrompt += `5. UNIDADES DE MEDIDA (CRÍTICO): Cada produto tem sua própria unidade (Unidade, Kg, Rolo, Metro, etc.). JAMAIS GENERALIZE. Se o Produto A é "Rolo" e o Produto B é "Kg", fale exatamente assim. Nunca diga que "todos são vendidos por rolo". Verifique item por item.\n`;
            systemPrompt += `6. PREÇOS OCULTOS [PREÇO_OCULTO: Motivo]: Se um produto estiver marcado com isso, NÃO INVENTE UM PREÇO. Responda ao cliente explicando o motivo (ex: "O valor é sob consulta", "Preciso verificar com o vendedor"). Se o motivo for "Preço com vendedor", diga que vai chamar um atendente humano.`;
        }

        // Humanization & Memory Control
        systemPrompt += `\n\nDIRETRIZES DE HUMANIZAÇÃO (CRÍTICO):
        1. NATURALIDADE EXTREMA: Aja como um humano conversando no WhatsApp. Use linguagem fluida, pode abreviar (vc, tbm) se o tom permitir.
        2. PROIBIDO ROBOTISMO: JAMAIS termine frases com 'Posso ajudar em algo mais?', 'Se precisar estou aqui'. ISSO É PROIBIDO.
        3. DIRETO AO PONTO: Responda a pergunta e pronto. Não enrole.
        4. IMAGENS (REGRA DE OURO):
           - "Foto", "Imagem", "Fotografia", "Ver", "Mostra" = TUDO A MESMA COISA.
           - Se pedirem QUALQUER termo visual, e tiver [TEM_IMAGEM], VOCÊ DEVE MANDAR A TAG [SHOW_IMAGE: ID].
           - JAMAIS diga "não consigo enviar imagens". Você CONSEGUE (via tag).
           - Se não tiver foto da variação, mande a principal. NUNCA deixe o cliente sem foto.`;

        // Strict Anti-Repetition logic if history exists
        if (history && history.length > 0) {
            systemPrompt += `\n\nATENÇÃO: Este é um diálogo em andamento. NÃO CUMPRIMENTE o usuário novamente.
        CRÍTICO: Não ofereça ajuda extra no final da mensagem. Apenas responda.`;
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

RESPOSTA CORRETA:
"Aqui está a foto da Camisa Engenheiro! 👕
[SHOW_IMAGE: 1770087032682]"

❌ ERROS FATAIS - NUNCA FAÇA:
- [SHOW_IMAGE: ID_DO_PRODUTO] ← Não use texto, use número!
- [SHOW_IMAGE: 50] ← Não invente IDs!
- [SHOW_IMAGE: 12345] ← Não use IDs de exemplo!

✅ REGRA DE OURO: 
COPIE O ID NUMÉRICO EXATO DA LISTA DE PRODUTOS. Se o ID na lista é "1770087032682", use exatamente "1770087032682".
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
                                const safeVariants = (p.variantItems || []).map(v => ({
                                    id: String(v.id), // Stringify numbers to be safe
                                    name: v.name,
                                    color: v.color,
                                    size: v.size,
                                    price: Number(v.price),
                                    hasImage: !!v.image // Tell AI it has an image, but do NOT send the base64 string
                                }));

                                return {
                                    id: String(p.id),
                                    name: p.name,
                                    type: p.type === 'service' ? 'servico' : 'produto',
                                    description: String(p.description || '').substring(0, 500),
                                    price: Number(p.price),
                                    priceHidden: p.priceHidden || false,
                                    unit: p.unit || 'Unidade',
                                    customUnit: p.customUnit || '',
                                    paymentConditions: p.paymentConditions || '',
                                    paymentLink: p.paymentLink || '',
                                    hasPaymentLink: !!p.hasPaymentLink,
                                    paymentPrices: p.paymentPrices || [], // Returns list of {label, price, active}
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
                    console.log(`[Chat] Image not found for ${targetId}`);
                    // Append error to the previous text chunk or new text chunk
                    messageChunks.push({
                        type: 'text',
                        content: `(⚠️ Erro: Imagem não encontrada para o ID: ${targetId})`
                    });
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
            // No images, just text
            messageChunks.push({ type: 'text', content: aiResponse });
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

        return { aiResponse, audioBase64, productImageUrl, productCaption, pdfBase64, pdfName, messageChunks };

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
    try {
        const config = await prisma.agentConfig.findUnique({ where: { companyId } });
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
        const historyItem = await prisma.promptHistory.findUnique({ where: { id: historyId } });
        if (!historyItem) return res.status(404).json({ message: 'Versão não encontrada' });

        await prisma.agentConfig.update({
            where: { companyId },
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
        const history = await prisma.testMessage.findMany({
            where: { companyId: req.user.companyId },
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


// --- PROMP API INTEGRATION ---


app.post('/api/promp/connect', authenticateToken, async (req, res) => {
    // SessionID manual input support
    const { identity, sessionId, manualUserId } = req.body;
    const companyId = req.user.companyId;

    if (!PROMP_ADMIN_TOKEN) {
        return res.status(500).json({ message: 'Server misconfiguration: PROMP_ADMIN_TOKEN missing' });
    }

    try {
        console.log(`[Promp] Auto-connecting for identity: ${identity} (Manual Session: ${sessionId || 'No'})`);

        // 1. List Tenants to get IDs
        const tenantsRes = await fetch(`${PROMP_BASE_URL}/tenantApiListTenants`, {
            headers: { 'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}` }
        });

        if (!tenantsRes.ok) throw new Error('Failed to list tenants');

        const tenantsData = await tenantsRes.json();
        const tenantListBasic = Array.isArray(tenantsData) ? tenantsData : (tenantsData.tenants || tenantsData.data || []);

        console.log(`[Promp] Checking ${tenantListBasic.length} tenants for identity (Parallel Fetch)...`);

        // 2. Parallel Fetch Details (identity is only in detailed view)
        const detailPromises = tenantListBasic.map(async (t) => {
            try {
                const res = await fetch(`${PROMP_BASE_URL}/tenantApiShowTenant`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: t.id })
                });
                if (!res.ok) return null;
                const json = await res.json();
                const tenantObj = Array.isArray(json.tenant) ? json.tenant[0] : json.tenant;
                return tenantObj || json;
            } catch (e) {
                return null;
            }
        });

        const detailedTenants = await Promise.all(detailPromises);

        // Exact match on identity string (Sanitized)
        const sanitize = (str) => String(str || '').replace(/\D/g, '');
        const targetIdentity = sanitize(identity);

        const targetTenant = detailedTenants.find(t => t && sanitize(t.identity) === targetIdentity);

        if (!targetTenant) {
            console.log('[Promp] Available Identities:', detailedTenants.map(t => t?.identity).join(', '));
            return res.status(404).json({ message: 'Tenant não encontrado na Promp com esta identidade.' });
        }

        console.log(`[Promp] Found Tenant: ${targetTenant.name} (ID: ${targetTenant.id})`);

        // 3. Create API (Best Effort)
        const apiName = "Agente IA Auto";

        // Priority: Manual Session ID > Tenant ID (Fallback)
        // If manual sessionId is provided, use it blindly.
        // If not, use tenant.id (which failed before, but is the best guess if no other option).
        const finalSessionId = sessionId || targetTenant.id;

        // RESOLVE USER ID (CRITICAL FOR MULTI-TENANT)
        // We must find a valid User ID *inside* this specific tenant.

        let targetUserId = null;

        // Strategy 0: Manual User ID (Override - Highest Priority)
        if (manualUserId) {
            const manualIdInt = parseInt(manualUserId);
            if (!isNaN(manualIdInt)) {
                console.log(`[Promp] Manual User ID provided: ${manualIdInt}. Validating against Tenant...`);

                let fetchDebug = '';
                let tenantUsers = targetTenant.users;
                // Fetch if missing
                if (!tenantUsers || !Array.isArray(tenantUsers) || tenantUsers.length === 0) {
                    try {
                        console.log(`[Promp] Fetching users for Tenant ${targetTenant.id} (manual validation)...`);
                        const usersRes = await fetch(`${PROMP_BASE_URL}/userApiList`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tenantId: targetTenant.id })
                        });

                        if (usersRes.ok) {
                            const usersData = await usersRes.json();
                            tenantUsers = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
                            targetTenant.users = tenantUsers;
                            console.log(`[Promp] Fetched ${tenantUsers.length} users.`);
                        } else {
                            const errText = await usersRes.text();
                            fetchDebug = `Status: ${usersRes.status}, Resp: ${errText}`;
                            console.error('[Promp] Fetch User List Failed:', fetchDebug);
                        }
                    } catch (e) {
                        fetchDebug = `Exception: ${e.message}`;
                        console.error('Error fetching users for manual validation:', e);
                    }
                }

                if (Array.isArray(tenantUsers)) {
                    const exists = tenantUsers.find(u => u.id === manualIdInt);
                    if (exists) {
                        targetUserId = manualIdInt;
                        console.log(`[Promp] MANUAL USER ID VALIDATED and SELECTED: ${targetUserId}`);
                    } else {
                        console.warn(`[Promp] Manual User ID ${manualIdInt} NOT FOUND in Tenant #${targetTenant.id}.`);
                        return res.status(400).json({
                            message: `O ID de usuário informado (${manualIdInt}) não foi encontrado neste Tenant (ID: ${targetTenant.id}). IDs disponíveis: ${tenantUsers.map(u => u.id + ' (' + u.name + ')').join(', ')}`
                        });
                    }
                } else {
                    // If we can't validate (API failure), TRUST THE USER.
                    console.warn(`[Promp] Validation skipped (API error: ${fetchDebug || 'Unknown'}). Trusting Manual ID: ${manualIdInt}`);
                    targetUserId = manualIdInt;
                }
            }
        }

        // Strategy 1: Match by Email (Identity Alignment)
        if (!targetUserId) {

            // Check if the current logged-in Agent user exists in the Target Tenant's user list

            try {
                const currentUser = await prisma.user.findUnique({
                    where: { id: req.user.userId }
                });

                if (currentUser && currentUser.email) {
                    const currentUserEmail = currentUser.email.trim().toLowerCase();

                    if (Array.isArray(targetTenant.users)) {
                        // Case-insensitive match
                        const matchedUser = targetTenant.users.find(u => u.email && u.email.trim().toLowerCase() === currentUserEmail);

                        if (matchedUser) {
                            targetUserId = matchedUser.id;
                            console.log(`[Promp] IDENTITY MATCH FOUND! Email: ${currentUserEmail} -> User ID: ${targetUserId}`);
                        } else {
                            console.log(`[Promp] No match for ${currentUserEmail} in tenant users:`, targetTenant.users.map(u => u.email));
                        }
                    }
                }
            } catch (authErr) {
                console.error('[Promp] Auth lookup failed (skipping email match):', authErr);
            }

            // Strategy 2: Admin/Owner Fallback (if no email match)
            if (!targetUserId) {
                targetUserId = targetTenant.adminId || targetTenant.userId || targetTenant.ownerId;
            }

            // Inspect 'users' array if available (Fallback to first user)
            if (!targetUserId && Array.isArray(targetTenant.users) && targetTenant.users.length > 0) {
                targetUserId = targetTenant.users[0].id;
                console.log(`[Promp] Found User ID from 'users' array (First User): ${targetUserId}`);
            }

            // Inspect 'admin' object if available
            if (!targetUserId && targetTenant.admin && targetTenant.admin.id) {
                targetUserId = targetTenant.admin.id;
                console.log(`[Promp] Found User ID from 'admin' object: ${targetUserId}`);
            }

            // Final Fallback (Try 1, but warn)
            if (!targetUserId) {
                console.warn('[Promp] WARNING: No explicit User ID found in Tenant object. Defaulting to 1 (Risk of failure).');
                console.log('[Promp] Tenant Keys:', Object.keys(targetTenant).join(', '));
                targetUserId = 1;
            }

        }

        console.log(`[Promp] Creating API for Tenant: ${targetTenant.id} | User: ${targetUserId} | Session: ${finalSessionId}`);

        const createApiRes = await fetch(`${PROMP_BASE_URL}/tenantCreateApi`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: apiName,
                sessionId: finalSessionId,
                userId: targetUserId,
                authToken: Math.random().toString(36).substring(7),
                tenant: targetTenant.id
            })
        });

        let apiData = await createApiRes.json();

        if (!createApiRes.ok || !apiData.id) {
            console.error('[Promp] API Create Failed:', JSON.stringify(apiData));
            // Return ACTUAL error from upstream + Context
            return res.status(400).json({
                message: `Falha na API Promp: ${apiData.error || apiData.message || JSON.stringify(apiData)}. (Tenant: ${targetTenant.id}, User Tentado: ${targetUserId})`
            });
        }

        // SAVE TO DB (Upsert to create if missing)
        await prisma.agentConfig.upsert({
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
        });

        res.json({ success: true, message: `Conectado a ${targetTenant.name}` });

    } catch (error) {
        console.error('Promp Connect Error:', error);
        res.status(500).json({ message: error.message || 'Erro ao conectar com Promp' });
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

    // Check Parent (ID exact match)
    for (const p of products) {
        if (String(p.id) === cleanId) {
            if (p.image) {
                console.log(`[ImageResolution] FOUND by ID Match: ${cleanId}`);
                return { found: true, url: p.image, caption: `${p.name} - R$ ${p.price}` };
            } else {
                // Produto encontrado mas SEM imagem cadastrada
                console.log(`[ImageResolution] Product ${cleanId} exists but has NO IMAGE`);
                return {
                    found: false,
                    productExists: true,
                    productName: p.name,
                    error: `O produto "${p.name}" não tem imagem cadastrada`
                };
            }
        }

        // Check Parent (Name loose match - Fallback)
        if (p.name && p.name.toLowerCase().includes(cleanId.toLowerCase())) {
            if (p.image) {
                console.log(`[ImageResolution] FOUND by Name Match: "${cleanId}" in "${p.name}"`);
                return { found: true, url: p.image, caption: `${p.name} - R$ ${p.price}` };
            }
        }

        // Check Variations
        if (p.variantItems) {
            const variant = p.variantItems.find(v => String(v.id) === cleanId);
            if (variant) {
                if (variant.image || p.image) {
                    const details = [variant.color, variant.size].filter(Boolean).join(' / ');
                    console.log(`[ImageResolution] FOUND VARIANT by ID Match: ${cleanId} (Parent: ${p.name})`);
                    return { found: true, url: variant.image || p.image, caption: `${p.name} - ${details} - R$ ${variant.price || p.price}` };
                } else {
                    // Variação encontrada mas sem imagem
                    console.log(`[ImageResolution] Variant ${cleanId} exists but has NO IMAGE`);
                    return {
                        found: false,
                        productExists: true,
                        productName: `${p.name} - ${variant.color || ''} ${variant.size || ''}`.trim(),
                        error: `A variação "${variant.color || ''} ${variant.size || ''}" de "${p.name}" não tem imagem cadastrada`
                    };
                }
            }
        }
    }

    console.log(`[ImageResolution] NOT FOUND for Target: "${cleanId}"`);
    return { found: false, error: `Produto com ID ${cleanId} não encontrado` };
};



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
