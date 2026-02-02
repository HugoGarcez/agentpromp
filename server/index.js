import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'; // In production use .env

const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Serve Static Frontend (Vite Build)
app.use(express.static(path.join(__dirname, '../dist')));


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
    const config = await prisma.agentConfig.findUnique({
        where: { companyId }
    });

    if (!config) return null;

    // Parse JSON fields
    return {
        ...config,
        persona: config.persona ? JSON.parse(config.persona) : undefined,
        integrations: config.integrations ? JSON.parse(config.integrations) : undefined,
        products: config.products ? JSON.parse(config.products) : undefined,
    };
};

app.post('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const newConfig = req.body;

    try {
        const currentConfig = await prisma.agentConfig.findUnique({ where: { companyId } });

        // Merge Voice settings into Integrations for storage
        // The frontend sends 'integrations' (LLM keys) and 'voice' (Audio settings) separately.
        // We store them together in the 'integrations' JSON column.
        let combinedIntegrations = newConfig.integrations || {};
        if (newConfig.voice) {
            combinedIntegrations = { ...combinedIntegrations, ...newConfig.voice };
        }

        const data = {
            companyId,
            systemPrompt: newConfig.systemPrompt,
            persona: newConfig.persona ? JSON.stringify(newConfig.persona) : undefined,
            integrations: JSON.stringify(combinedIntegrations),
            products: newConfig.products ? JSON.stringify(newConfig.products) : undefined,
        };

        const updatedConfig = await prisma.agentConfig.upsert({
            where: { companyId },
            update: data,
            create: data,
        });

        // Save History if systemPrompt changed
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
        console.error('Error saving config:', error);
        res.status(500).json({ success: false, message: 'Failed to save configuration' });
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

// --- REUSABLE CHAT LOGIC ---
const processChatResponse = async (config, message, history, sessionId = null) => {
    if (!config || !config.integrations?.openaiKey) {
        throw new Error('OpenAI API Key not configured');
    }

    const openai = new OpenAI({ apiKey: config.integrations.openaiKey });

    let systemPrompt = config.systemPrompt || "Você é um assistente virtual útil.";

    // Inject Products
    if (config.products && config.products.length > 0) {
        const productList = config.products.map(p =>
            `- ${p.name}: R$ ${p.price} (ID: ${p.id}). ${p.description || ''} ${p.image ? '[TEM_IMAGEM]' : ''}`
        ).join('\n');
        systemPrompt += `\n\nCONTEXTO DE PRODUTOS DISPONÍVEIS:\n${productList}\n\nINSTRUÇÃO IMPORTANTE: Se o usuário pedir para ver uma foto ou imagem de um produto e ele tiver a flag [TEM_IMAGEM], responda EXATAMENTE com a tag: [SHOW_IMAGE: ID_DO_PRODUTO]. Exemplo: [SHOW_IMAGE: 12345]. Não invente links.`;
    }

    // Humanization & Memory Control
    systemPrompt += `\n\nDIRETRIZES DE HUMANIZAÇÃO (CRÍTICO):
        1. NATURALIDADE: Aja como um humano. NÃO inicie todas as respostas com cumprimentos (Olá, Tudo bem, etc) se a conversa já está fluindo. Seja direto.
        2. MEMÓRIA: Você tem acesso ao histórico da conversa. Use-o para manter a continuidade.
        3. CONCISÃO: Evite textos longos e robóticos, a menos que necessário.`;

    // Prepare Messages (History + System)
    let messages = [{ role: "system", content: systemPrompt }];

    if (Array.isArray(history) && history.length > 0) {
        const cleanHistory = history.map(h => ({
            role: h.role === 'user' || h.role === 'assistant' ? h.role : 'user',
            content: h.content || ''
        }));
        messages = [...messages, ...cleanHistory];
    } else {
        messages.push({ role: "user", content: message });
    }

    const completion = await openai.chat.completions.create({
        messages: messages,
        model: "gpt-3.5-turbo",
    });

    const aiResponse = completion.choices[0].message.content;

    // --- Audio Generation Logic ---
    let audioBase64 = null;
    const integrator = config.integrations || {};
    const isVoiceEnabled = integrator.enabled === true || integrator.enabled === 'true';

    if (isVoiceEnabled && integrator.elevenLabsKey) {
        let shouldGenerate = true;

        // Probability Check
        if (integrator.responseType === 'percentage') {
            const probability = parseInt(integrator.responsePercentage || 50, 10);
            const randomVal = Math.random() * 100;
            if (randomVal > probability) {
                shouldGenerate = false;
                console.log(`Audio skipped by probability: ${randomVal.toFixed(0)} > ${probability}`);
            }
        } else if (integrator.responseType === 'audio_only') {
            shouldGenerate = false; // Simplified logic for now
        }

        if (shouldGenerate) {
            try {
                let voiceId = integrator.voiceId || integrator.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';

                // Fallback for Agent IDs
                if (voiceId.startsWith('agent_')) {
                    console.warn(`Invalid Voice ID for TTS detected (${voiceId}). Falling back to default 'Rachel'.`);
                    voiceId = '21m00Tcm4TlvDq8ikWAM';
                }

                const responseStream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                    method: 'POST',
                    headers: {
                        'xi-api-key': integrator.elevenLabsKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        text: aiResponse.replace(/\[SHOW_IMAGE:\s*\d+\]/g, ''),
                        model_id: "eleven_multilingual_v2", // Updated for Portuguese support
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75
                        }
                    })
                });

                if (responseStream.ok) {
                    const arrayBuffer = await responseStream.arrayBuffer();
                    audioBase64 = Buffer.from(arrayBuffer).toString('base64');
                } else {
                    console.error('ElevenLabs API Error:', await responseStream.text());
                }
            } catch (audioError) {
                console.error('Audio Generation Error:', audioError);
            }
        }
    }

    return { aiResponse, audioBase64 };
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



// --- Chat Endpoint (Protected - Panel Test) ---
app.post('/api/chat', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const { message, history, systemPrompt: overridePrompt, useConfigPrompt = true } = req.body;

    if (!message) return res.status(400).json({ error: 'Message required' });

    try {
        const config = await getCompanyConfig(companyId);

        // Allow override for Test Panel
        if (!useConfigPrompt && overridePrompt) {
            config.systemPrompt = overridePrompt;
        }

        const { aiResponse, audioBase64 } = await processChatResponse(config, message, history, null);

        // Persist Chat (Test Mode - No Session)
        try {
            await prisma.testMessage.create({ data: { companyId, sender: 'user', text: message } });
            await prisma.testMessage.create({ data: { companyId, sender: 'ai', text: aiResponse } });
        } catch (dbError) {
            console.error('Failed to save chat history:', dbError);
        }

        res.json({ response: aiResponse, audio: audioBase64 });

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

const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';
// MUST be set in .env on the server
const PROMP_ADMIN_TOKEN = process.env.PROMP_ADMIN_TOKEN;

const sendPrompMessage = async (config, number, text, audioBase64) => {
    if (!config.prompUuid || !config.prompToken) {
        console.log('[Promp] Skipping external API execution (Credentials missing).');
        return false;
    }

    // Removing '55' prefix if exists (Promp API usually handles it, or check documentation)
    // Postman doc example: "5515998566622". Okay, keep it.

    // 1. Send Text
    try {
        console.log(`[Promp] Sending Text to ${number}...`);
        const textResponse = await fetch(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.prompToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                number: number,
                body: text,
                externalKey: `ai_${Date.now()}`,
                isClosed: false
            })
        });

        if (!textResponse.ok) {
            console.error('[Promp] Text Send Failed:', await textResponse.text());
        }
    } catch (e) {
        console.error('[Promp] Text Exception:', e);
    }

    // 2. Send Audio (if exists)
    if (audioBase64) {
        // We need to upload file or send as base64. 
        // Postman "SendMessageAPITextBase64" endpoint exists: /base64
        try {
            console.log(`[Promp] Sending Audio to ${number}...`);
            const audioResponse = await fetch(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}/base64`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.prompToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    number: number,
                    body: "Áudio da IA", // Caption
                    base64Data: audioBase64,
                    mimeType: "audio/mpeg",
                    fileName: "audio_ia.mp3",
                    isClosed: false
                })
            });

            if (!audioResponse.ok) {
                console.error('[Promp] Audio Send Failed:', await audioResponse.text());
            }
        } catch (e) {
            console.error('[Promp] Audio Exception:', e);
        }
    }

    return true;
};

app.post('/api/promp/connect', authenticateToken, async (req, res) => {
    const { identity } = req.body;
    const companyId = req.user.companyId;

    if (!PROMP_ADMIN_TOKEN) {
        return res.status(500).json({ message: 'Server misconfiguration: PROMP_ADMIN_TOKEN missing' });
    }

    try {
        console.log(`[Promp] Auto-connecting for identity: ${identity}`);

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

        // Try creating API key - Using Tenant ID as Session ID fallback if unknown
        const createApiRes = await fetch(`${PROMP_BASE_URL}/tenantCreateApi`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: apiName,
                sessionId: targetTenant.id,
                userId: targetTenant.adminId || 1,
                authToken: Math.random().toString(36).substring(7),
                tenant: targetTenant.id
            })
        });

        let apiData = await createApiRes.json();

        if (!createApiRes.ok || !apiData.id) {
            console.error('[Promp] API Create Failed:', JSON.stringify(apiData));
            return res.status(400).json({ message: 'Tenant encontrado, mas falha ao criar API Key. Verifique sessões.' });
        }

        // SAVE TO DB
        await prisma.agentConfig.update({
            where: { companyId },
            data: {
                prompIdentity: identity,
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
app.post('/webhook/:companyId', async (req, res) => {
    const { companyId } = req.params;
    const payload = req.body; // n8n payload

    console.log(`[Webhook] Received for company ${companyId}:`, JSON.stringify(payload));

    // Validate Payload
    if (!payload.content || !payload.content.text) {
        return res.status(400).json({ error: 'Invalid payload structure. content.text missing.' });
    }

    const userMessage = payload.content.text;

    // Support both N8N structure (ticket.id) and pure Promp structure (might differ)
    // If it comes from Promp API "MessageStatus" webhook, the structure might be different.
    // For now, assuming N8N/Uazapi style payload as requested initially.
    const sessionId = payload.ticket?.id ? String(payload.ticket.id) : null;
    const senderNumber = payload.contact?.number || payload.number; // Ensure we have a number to reply to!

    const metadata = JSON.stringify(payload);

    try {
        const config = await getCompanyConfig(companyId);
        if (!config) return res.status(404).json({ error: 'Company config not found. Check ID.' });

        // Fetch History
        let history = [];
        if (sessionId) {
            const storedMessages = await prisma.testMessage.findMany({
                where: { companyId, sessionId },
                orderBy: { createdAt: 'asc' },
                take: 20
            });
            history = storedMessages.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text
            }));
        }

        // Process Chat
        const { aiResponse, audioBase64 } = await processChatResponse(config, userMessage, history, sessionId);

        // Persist Chat
        try {
            await prisma.testMessage.create({
                data: { companyId, sender: 'user', text: userMessage, sessionId, metadata }
            });
            await prisma.testMessage.create({
                data: { companyId, sender: 'ai', text: aiResponse, sessionId }
            });
        } catch (dbError) {
            console.error('[Webhook] Failed to save chat:', dbError);
        }

        // --- REPLY STRATEGY ---
        // 1. If Promp Integration is Active (UUID+Token), use Promp API.
        // 2. Otherwise, return JSON (Direct Reply).

        let sentViaApi = false;
        if (config.prompUuid && config.prompToken && senderNumber) {
            sentViaApi = await sendPrompMessage(config, senderNumber, aiResponse, audioBase64);
        }

        if (sentViaApi) {
            // If sent via API, just return OK to the webhook caller to close connection.
            res.json({ status: 'sent_via_api' });
        } else {
            // Fallback: Return JSON for N8N/Direct
            res.json({
                text: aiResponse,
                audio: audioBase64,
                sessionId: sessionId
            });
        }

    } catch (error) {
        console.error('[Webhook] Error:', error);
        res.status(500).json({ error: error.message || 'Processing failed' });
    }
});

// Handle React Routing (SPA) - must be the last route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
